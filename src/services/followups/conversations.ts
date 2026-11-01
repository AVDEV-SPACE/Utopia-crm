import { sql } from '@/lib/neon';
import {
  Conversation,
  ConversationChannel,
  ConversationMessage,
  ConversationMessageKind,
  ConversationRole,
} from './types';

/**
 * Twilio trimite `whatsapp:+40712345678` pe WhatsApp și `+40712345678` pe SMS.
 * În DB stocăm mereu forma E.164 curată, ca aceeași persoană să nu apară de
 * două ori dacă schimbă canalul.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/i, '').trim();
}

interface UpsertConversationInput {
  orgId: string;
  channel: ConversationChannel;
  contactPhone: string;
  waId?: string | null;
  contactName?: string | null;
}

export async function getOrCreateConversation(
  input: UpsertConversationInput
): Promise<Conversation> {
  const phone = normalizePhone(input.contactPhone);

  const rows = await sql`
    INSERT INTO conversations (org_id, channel, contact_phone, wa_id, contact_name, last_message_at)
    VALUES (
      ${input.orgId}, ${input.channel}, ${phone},
      ${input.waId ?? null}, ${input.contactName ?? null}, now()
    )
    ON CONFLICT (org_id, channel, contact_phone) DO UPDATE SET
      last_message_at = now(),
      wa_id           = COALESCE(EXCLUDED.wa_id, conversations.wa_id),
      contact_name    = COALESCE(EXCLUDED.contact_name, conversations.contact_name)
    RETURNING *
  `;
  return rows[0] as unknown as Conversation;
}

/**
 * Adaugă un mesaj în log. Întoarce `null` dacă `twilioSid` a mai fost salvat
 * (retry de webhook) — apelantul trebuie să nu proceseze mesajul a doua oară.
 */
export async function appendMessage(input: {
  conversationId: string;
  role: ConversationRole;
  body: string;
  twilioSid?: string | null;
}): Promise<ConversationMessage | null> {
  const rows = await sql`
    INSERT INTO conversation_messages (conversation_id, role, body, twilio_sid)
    VALUES (${input.conversationId}, ${input.role}, ${input.body}, ${input.twilioSid ?? null})
    ON CONFLICT (twilio_sid) WHERE twilio_sid IS NOT NULL DO NOTHING
    RETURNING *
  `;
  return (rows[0] as unknown as ConversationMessage) ?? null;
}

/** Ultimele mesaje, în ordine cronologică (cel mai vechi primul). */
export async function getRecentMessages(
  conversationId: string,
  limit = 20
): Promise<ConversationMessage[]> {
  const rows = await sql`
    SELECT * FROM (
      SELECT * FROM conversation_messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    ) recent
    ORDER BY created_at ASC
  `;
  return rows as unknown as ConversationMessage[];
}

/**
 * A preluat un om conversația în fereastra configurată?
 * `taken_by_human_at` mai vechi decât fereastra înseamnă că preluarea a expirat
 * și AI-ul poate răspunde din nou.
 */
export function isHumanHandling(conversation: Conversation, windowMinutes: number): boolean {
  if (!conversation.taken_by_human) return false;
  // 0 minute = AI-ul nu preia niciodată o conversație marcată de om.
  if (windowMinutes <= 0) return true;
  if (!conversation.taken_by_human_at) return true;

  const takenAt = new Date(conversation.taken_by_human_at).getTime();
  if (Number.isNaN(takenAt)) return true;

  return Date.now() - takenAt < windowMinutes * 60_000;
}

export async function setHumanTakeover(input: {
  conversationId: string;
  orgId: string;
  takenByHuman: boolean;
  userId: string | null;
}): Promise<Conversation | null> {
  const rows = await sql`
    UPDATE conversations SET
      taken_by_human    = ${input.takenByHuman},
      taken_by_human_at = ${input.takenByHuman ? new Date().toISOString() : null},
      taken_by_user_id  = ${input.takenByHuman ? input.userId : null}
    WHERE id = ${input.conversationId} AND org_id = ${input.orgId}
    RETURNING *
  `;
  return (rows[0] as unknown as Conversation) ?? null;
}

// ── Facebook / Instagram (persoana = PSID / IGSID, fără telefon) ──────────

/**
 * Varianta socială a `getOrCreateConversation`: cheia e (org, canal, id extern),
 * telefonul rămâne NULL. Cea pe telefon (WhatsApp / SMS) nu se schimbă.
 */
export async function getOrCreateSocialConversation(input: {
  orgId: string;
  channel: Extract<ConversationChannel, 'facebook' | 'instagram'>;
  externalUserId: string;
  contactName?: string | null;
}): Promise<Conversation> {
  const rows = await sql`
    INSERT INTO conversations (org_id, channel, external_user_id, contact_name, last_message_at)
    VALUES (${input.orgId}, ${input.channel}, ${input.externalUserId}, ${input.contactName ?? null}, now())
    ON CONFLICT (org_id, channel, external_user_id) WHERE external_user_id IS NOT NULL DO UPDATE SET
      last_message_at = now(),
      contact_name    = COALESCE(EXCLUDED.contact_name, conversations.contact_name)
    RETURNING *
  `;
  return rows[0] as unknown as Conversation;
}

/**
 * Un DM sau un comentariu. `externalId` (mid / id comentariu) face inserarea
 * idempotentă: `null` = mesaj deja salvat (retry de webhook).
 */
export async function appendSocialMessage(input: {
  conversationId: string;
  role: ConversationRole;
  body: string;
  externalId: string | null;
  kind: ConversationMessageKind;
  externalParentId?: string | null;
  createdAt?: Date;
}): Promise<ConversationMessage | null> {
  const rows = await sql`
    INSERT INTO conversation_messages (conversation_id, role, body, external_id, kind, external_parent_id, created_at)
    VALUES (
      ${input.conversationId}, ${input.role}, ${input.body}, ${input.externalId},
      ${input.kind}, ${input.externalParentId ?? null}, ${(input.createdAt ?? new Date()).toISOString()}::timestamptz
    )
    ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
    RETURNING *
  `;
  return (rows[0] as unknown as ConversationMessage) ?? null;
}

/** Leagă conversația de lead-ul persoanei (și îi completează numele). */
export async function setConversationLead(conversationId: string, leadId: string, contactName: string | null): Promise<void> {
  await sql`
    UPDATE conversations SET lead_id = ${leadId}, contact_name = COALESCE(contact_name, ${contactName})
    WHERE id = ${conversationId}
  `;
}

export async function getConversation(id: string, orgId: string): Promise<Conversation | null> {
  const rows = await sql`SELECT * FROM conversations WHERE id = ${id}::uuid AND org_id = ${orgId}`;
  return (rows[0] as unknown as Conversation) ?? null;
}

/** Un rând din inbox-ul /socials: conversația + ultimul mesaj. */
export interface SocialConversationSummary extends Conversation {
  last_body: string | null;
  last_role: ConversationRole | null;
  last_kind: ConversationMessageKind | null;
  /** Ultimul mesaj primit de la client (pentru fereastra de 24h) */
  last_inbound_at: string | null;
}

export async function listSocialConversations(
  orgId: string,
  channel: Extract<ConversationChannel, 'facebook' | 'instagram'> | null,
  limit = 100
): Promise<SocialConversationSummary[]> {
  const rows = await sql`
    SELECT c.*, last.body AS last_body, last.role AS last_role, last.kind AS last_kind,
           (SELECT max(m.created_at) FROM conversation_messages m
             WHERE m.conversation_id = c.id AND m.role = 'user' AND m.kind = 'dm') AS last_inbound_at
    FROM conversations c
    LEFT JOIN LATERAL (
      SELECT body, role, kind FROM conversation_messages m
      WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1
    ) last ON true
    WHERE c.org_id = ${orgId}
      AND c.channel IN ('facebook', 'instagram')
      AND (${channel}::text IS NULL OR c.channel = ${channel})
    ORDER BY c.last_message_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as SocialConversationSummary[];
}

/** Toate mesajele unei conversații, cronologic (cel mai vechi primul). */
export async function listConversationMessages(conversationId: string, limit = 200): Promise<ConversationMessage[]> {
  const rows = await sql`
    SELECT * FROM (
      SELECT * FROM conversation_messages WHERE conversation_id = ${conversationId}::uuid
      ORDER BY created_at DESC LIMIT ${limit}
    ) recent
    ORDER BY created_at ASC
  `;
  return rows as unknown as ConversationMessage[];
}

/** Ultimul DM primit de la client — de aici curge fereastra de 24h a Meta. */
export async function lastInboundDmAt(conversationId: string): Promise<Date | null> {
  const rows = await sql`
    SELECT max(created_at) AS at FROM conversation_messages
    WHERE conversation_id = ${conversationId}::uuid AND role = 'user' AND kind = 'dm'
  `;
  const at = (rows[0] as { at: string | null } | undefined)?.at;
  return at ? new Date(at) : null;
}

export async function listConversations(orgId: string, limit = 100): Promise<Conversation[]> {
  const rows = await sql`
    SELECT * FROM conversations
    WHERE org_id = ${orgId}
    ORDER BY last_message_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as Conversation[];
}
