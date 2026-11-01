import { sql } from '@/lib/neon';
import {
  appendSocialMessage,
  getOrCreateSocialConversation,
  getRecentMessages,
  isHumanHandling,
  setConversationLead,
} from '@/services/followups/conversations';
import { generateSocialReply } from '@/services/followups/ai';
import { getSettingsByOrgId } from '@/services/followups/settings';
import { DEFAULT_WHATSAPP_SYSTEM_PROMPT, type Conversation, type OrganizationSettings } from '@/services/followups/types';
import { logPipelineEvent } from '@/services/pipeline/repository';
import type { SocialChannel } from './config';
import type { SocialEvent } from './events';
import { getProfile, MESSAGE_MAX_CHARS, sendInstagramMessage, sendPageMessage } from './graph';
import { findOrCreateSocialLead } from './leads';

/**
 * Procesarea evenimentelor primite prin webhook-ul Meta, pe rând:
 * 1. conversația socială (cheia: PSID / IGSID) și mesajul — idempotent după
 *    `mid` / id-ul comentariului, deci un retry Meta nu dublează nimic;
 * 2. lead-ul persoanei (găsit sau creat) și evenimentul în pipeline_events;
 * 3. auto-reply AI — doar pe DM-uri primite, doar dacă e pornit din /socials,
 *    doar în fereastra de 24h a Meta și doar dacă nu a preluat un om conversația.
 *    Nu există DM-uri reci: CRM-ul răspunde, nu inițiază.
 */

/** Meta permite mesaje de tip RESPONSE doar la 24h de la ultimul mesaj al clientului. */
export const MESSAGING_WINDOW_MS = 24 * 60 * 60_000;

/** Cuvântul-cheie la care trimitem direct linkul de programare. */
const AUDIT_KEYWORD = /\baudit\b/i;
const AUDIT_REPLY =
  'Mulțumim pentru interes! Vă puteți programa auditul aici: https://www.utopia-systems.ro/meetings — alegeți intervalul care vă convine.';

export async function ingestSocialEvents(events: SocialEvent[]): Promise<void> {
  for (const event of events) {
    try {
      await ingestEvent(event);
    } catch (error) {
      // Un eveniment care eșuează nu le oprește pe celelalte din același webhook
      console.error(`[social] ${event.channel} ${event.kind} ${event.externalId} eșuat:`, error);
    }
  }
}

async function ingestEvent(event: SocialEvent): Promise<void> {
  const conversation = await getOrCreateSocialConversation({
    orgId: event.orgId,
    channel: event.channel,
    externalUserId: event.externalUserId,
    contactName: event.senderName,
  });

  const message = await appendSocialMessage({
    conversationId: conversation.id,
    role: 'user',
    body: event.text,
    externalId: event.externalId,
    kind: event.kind,
    externalParentId: event.externalParentId,
    createdAt: event.occurredAt,
  });
  if (!message) {
    console.log(`[social] ${event.externalId} deja procesat — ignorat`);
    return;
  }

  const lead = await linkLead(conversation, event);

  if (event.kind === 'dm') await maybeAutoReply(conversation, event);

  // Evenimentul se scrie după auto-reply: o eroare de jurnal nu trebuie să lase clientul fără răspuns
  await logPipelineEvent(
      {
        key: null,
        email: null,
        channel: event.channel,
        event: event.kind === 'comment' ? 'comment_received' : 'reply_received',
        // Un DM de la un lead deja în outreach înseamnă că a răspuns; un contact nou nu primește etapă
        stage: event.kind === 'dm' && lead.pipelineStage ? 'REPLIED' : null,
        campaignId: null,
        replyText: event.text,
        occurredAt: event.occurredAt,
        payload: { conversationId: conversation.id, externalId: event.externalId, kind: event.kind },
      },
      lead.id
    );
}

/** Lead-ul conversației: cel deja legat, sau găsit / creat acum (cu numele din profil). */
async function linkLead(conversation: Conversation, event: SocialEvent): Promise<{ id: string; pipelineStage: string | null }> {
  if (conversation.lead_id) {
    const rows = await sql`SELECT pipeline_stage FROM leads WHERE id = ${conversation.lead_id}::uuid`;
    return { id: conversation.lead_id, pipelineStage: (rows[0]?.pipeline_stage as string | null) ?? null };
  }

  let name = event.senderName;
  let username: string | null = event.channel === 'instagram' ? event.senderName : null;
  if (!name || event.channel === 'instagram') {
    try {
      const profile = await getProfile(event.channel, event.externalUserId);
      name = profile.name ?? name;
      username = profile.username ?? username;
    } catch (error) {
      // Fără nume (permisiuni, profil privat): lead-ul primește un nume generic
      console.warn(`[social] profilul ${event.channel} nu a putut fi citit:`, (error as Error).message);
    }
  }

  const lead = await findOrCreateSocialLead({
    orgId: event.orgId,
    channel: event.channel,
    externalUserId: event.externalUserId,
    name,
    username,
    kind: event.kind,
  });
  await setConversationLead(conversation.id, lead.id, name);
  return { id: lead.id, pipelineStage: lead.pipeline_stage };
}

async function maybeAutoReply(conversation: Conversation, event: SocialEvent): Promise<void> {
  const settings = await getSettingsByOrgId(event.orgId);
  if (!settings?.social_ai_enabled) return;
  if (isHumanHandling(conversation, settings.human_takeover_minutes)) {
    console.log(`[social] conversația ${conversation.id} e preluată de un om — AI oprit`);
    return;
  }
  // Un retry întârziat al unui mesaj vechi nu mai are voie să primească răspuns
  if (Date.now() - event.occurredAt.getTime() > MESSAGING_WINDOW_MS) return;

  const reply = AUDIT_KEYWORD.test(event.text) ? AUDIT_REPLY : await aiReply(conversation, event.channel, settings);
  if (!reply) return;

  const mid = await sendSocialMessage(event.channel, event.externalUserId, reply);
  await appendSocialMessage({ conversationId: conversation.id, role: 'assistant', body: reply, externalId: mid, kind: 'dm' });
}

async function aiReply(conversation: Conversation, channel: SocialChannel, settings: OrganizationSettings): Promise<string | null> {
  const history = await getRecentMessages(conversation.id, 20);
  const reply = await generateSocialReply({
    systemPrompt: settings.whatsapp_system_prompt.trim() || DEFAULT_WHATSAPP_SYSTEM_PROMPT,
    channel,
    history,
    maxChars: MESSAGE_MAX_CHARS[channel],
  });
  return reply || null;
}

/** Un DM pe canalul conversației; întoarce `mid`-ul mesajului trimis. */
export function sendSocialMessage(channel: SocialChannel, externalUserId: string, text: string): Promise<string | null> {
  return channel === 'instagram' ? sendInstagramMessage(externalUserId, text) : sendPageMessage(externalUserId, text);
}
