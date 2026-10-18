import { sql } from '@/lib/neon';
import {
  Conversation,
  ConversationChannel,
  ConversationMessage,
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

export async function listConversations(orgId: string, limit = 100): Promise<Conversation[]> {
  const rows = await sql`
    SELECT * FROM conversations
    WHERE org_id = ${orgId}
    ORDER BY last_message_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as Conversation[];
}
