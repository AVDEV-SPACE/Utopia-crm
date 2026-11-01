import { sql } from '@/lib/neon';
import { htmlToText, isHtmlContent } from '@/services/outreach/render';

/**
 * Conversația unui lead pe toate canalele, cronologic: ce i s-a trimis
 * (`sent_messages`, orice canal), ce a răspuns pe email (evenimentele
 * `reply_received` / `auto_reply`), conversațiile WhatsApp/SMS prin Twilio
 * (`conversation_messages`, potrivite după telefon) și restul evenimentelor
 * din pipeline (deschideri, schimbări de etapă). Notele rămân în `lead_notes`.
 */

/** Textul unui mesaj afișat în conversație e limitat (emailurile HTML pot fi lungi). */
const MAX_BODY = 4_000;

export interface TimelineMessage {
  type: 'message';
  id: string;
  at: string;
  direction: 'out' | 'in';
  channel: string;
  subject: string | null;
  body: string;
  /** Cine a scris, când nu e evident: „AI”, „Operator”, numele template-ului */
  author: string | null;
  /** Doar la mesajele primite pe email, clasificate de AI */
  intent: string | null;
  summary: string | null;
  /** Răspuns automat (concediu) */
  automatic: boolean;
  /** Trimiterea a eșuat */
  failed: boolean;
}

export interface TimelineEvent {
  type: 'event';
  id: string;
  at: string;
  event: string;
  channel: string | null;
  stage: string | null;
}

export type TimelineItem = TimelineMessage | TimelineEvent;

/** Evenimentele care dublează un rând din `sent_messages` (trimiterea e deja în conversație). */
const SENT_EVENT = /_sent(_manual)?$/;

const plain = (body: string) => (isHtmlContent(body) ? htmlToText(body) : body.trim()).slice(0, MAX_BODY);

/** Tabelele opționale (conversații Twilio) pot lipsi într-o instalare mai veche. */
async function optional<T>(query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return fallback;
    throw error;
  }
}

export async function getLeadTimeline(leadId: string, limit = 300): Promise<TimelineItem[]> {
  const [sent, events, chats] = await Promise.all([
    sql`
      SELECT id::text, channel, subject, body, template_title, status, created_at
      FROM sent_messages WHERE lead_id = ${leadId}::uuid
      ORDER BY created_at DESC LIMIT ${limit}
    `,
    sql`
      SELECT id::text, channel, event, stage, reply_text, payload, occurred_at
      FROM pipeline_events WHERE lead_id = ${leadId}::uuid
      ORDER BY occurred_at DESC LIMIT ${limit}
    `,
    // WhatsApp / SMS prin Twilio: aceeași persoană dacă ultimele 9 cifre ale telefonului coincid
    optional(
      sql`
        SELECT m.id::text, c.channel, m.role, m.body, m.created_at
        FROM leads l
        JOIN conversations c
          ON right(regexp_replace(c.contact_phone, '[^0-9]', '', 'g'), 9) = right(regexp_replace(l.contact_phone, '[^0-9]', '', 'g'), 9)
        JOIN conversation_messages m ON m.conversation_id = c.id
        WHERE l.id = ${leadId}::uuid AND length(regexp_replace(coalesce(l.contact_phone, ''), '[^0-9]', '', 'g')) >= 9
        ORDER BY m.created_at DESC LIMIT ${limit}
      `,
      []
    ),
  ]);

  const items: TimelineItem[] = [];

  for (const s of sent) {
    items.push({
      type: 'message',
      id: `sent:${s.id}`,
      at: new Date(s.created_at as string).toISOString(),
      direction: 'out',
      channel: s.channel as string,
      subject: (s.subject as string | null) ?? null,
      body: plain((s.body as string | null) ?? ''),
      author: (s.template_title as string | null) ?? null,
      intent: null,
      summary: null,
      automatic: false,
      failed: s.status === 'failed',
    });
  }

  for (const e of events) {
    const event = e.event as string;
    const at = new Date(e.occurred_at as string).toISOString();
    if (SENT_EVENT.test(event)) continue;
    const payload = (e.payload ?? {}) as { subject?: string | null; intent?: string | null; summary?: string | null };
    if (event === 'reply_received' || event === 'auto_reply') {
      items.push({
        type: 'message',
        id: `event:${e.id}`,
        at,
        direction: 'in',
        channel: (e.channel as string | null) ?? 'email',
        subject: payload.subject ?? null,
        body: ((e.reply_text as string | null) ?? '').slice(0, MAX_BODY),
        author: null,
        intent: payload.intent ?? null,
        summary: payload.summary ?? null,
        automatic: event === 'auto_reply',
        failed: false,
      });
    } else {
      items.push({
        type: 'event',
        id: `event:${e.id}`,
        at,
        event,
        channel: (e.channel as string | null) ?? null,
        stage: (e.stage as string | null) ?? null,
      });
    }
  }

  for (const m of chats as Record<string, unknown>[]) {
    items.push({
      type: 'message',
      id: `chat:${m.id}`,
      at: new Date(m.created_at as string).toISOString(),
      direction: m.role === 'user' ? 'in' : 'out',
      channel: m.channel as string,
      subject: null,
      body: ((m.body as string | null) ?? '').slice(0, MAX_BODY),
      author: m.role === 'assistant' ? 'AI' : m.role === 'human' ? 'Operator' : null,
      intent: null,
      summary: null,
      automatic: false,
      failed: false,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
