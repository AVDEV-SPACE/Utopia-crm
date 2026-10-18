import { sql } from '@/lib/neon';
import { gmailMessageUrl, gmailSearchUrl } from '@/lib/messaging';
import { NewSentMessage, SentMessage, SentMessageFilters } from './types';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

interface LogContext {
  orgId: string;
  userId: string;
}

/**
 * Scrie în jurnal toate mesajele unei trimiteri, într-un singur INSERT
 * (UNNEST peste coloane paralele — o trimitere are până la ~200 destinatari).
 *
 * Apelantul tratează eșecul ca ne-fatal: jurnalul nu trebuie să rupă o
 * trimitere care deja a plecat către destinatari.
 */
export async function logSentMessages(
  ctx: LogContext,
  entries: NewSentMessage[]
): Promise<void> {
  if (entries.length === 0) return;

  const col = <T>(pick: (e: NewSentMessage) => T) => entries.map(pick);

  await sql`
    INSERT INTO sent_messages (
      org_id, sent_by, channel, recipient_type, lead_id,
      recipient_name, recipient_email, recipient_phone,
      template_id, template_title, subject, body, status, error, message_id
    )
    SELECT
      ${ctx.orgId}::text, ${ctx.userId}::text, t.channel, t.recipient_type, t.lead_id::uuid,
      t.recipient_name, t.recipient_email, t.recipient_phone,
      t.template_id, t.template_title, t.subject, t.body, t.status, t.error, t.message_id
    FROM UNNEST(
      ${col((e) => e.channel)}::text[],
      ${col((e) => e.recipient_type)}::text[],
      ${col((e) => e.lead_id ?? null)}::text[],
      ${col((e) => e.recipient_name ?? null)}::text[],
      ${col((e) => e.recipient_email ?? null)}::text[],
      ${col((e) => e.recipient_phone ?? null)}::text[],
      ${col((e) => e.template_id ?? null)}::text[],
      ${col((e) => e.template_title ?? null)}::text[],
      ${col((e) => e.subject ?? null)}::text[],
      ${col((e) => e.body)}::text[],
      ${col((e) => e.status ?? 'sent')}::text[],
      ${col((e) => e.error ?? null)}::text[],
      ${col((e) => e.message_id ?? null)}::text[]
    ) AS t(
      channel, recipient_type, lead_id,
      recipient_name, recipient_email, recipient_phone,
      template_id, template_title, subject, body, status, error, message_id
    )
  `;
}

/** Statusuri de lead care înseamnă că pitch-ul a plecat deja către firmă. */
const PITCHED_LEAD_STATUSES = "('sent', 'replied', 'negotiating', 'won', 'lost')";

/**
 * Jurnalul tenantului curent, cel mai recent primul.
 *
 * Jurnalul propriu-zis (`sent_messages`) acoperă doar trimiterile de după
 * introducerea lui. Lead-urile marcate deja ca trimise — de trimiteri mai
 * vechi sau de fluxuri care nu trec prin /api/messaging/send — nu au linie în
 * jurnal, dar au fost pitch-uite, deci trebuie să apară în „Pitched”. Le
 * derivăm din tabela `leads`, doar pentru cele fără linie de jurnal, ca să nu
 * apară de două ori.
 */
export async function listSentMessages(
  orgId: string,
  filters: SentMessageFilters = {}
): Promise<SentMessage[]> {
  const params: unknown[] = [];
  /** Adaugă valoarea în params și întoarce placeholder-ul ei ($1, $2, ...). */
  const bind = (value: unknown) => `$${params.push(value)}`;

  const org = bind(orgId);
  const channel = filters.channel ? bind(filters.channel) : null;
  const leadId = filters.leadId ? bind(filters.leadId) : null;
  const search = filters.search ? bind(`%${filters.search}%`) : null;

  // ── Linii reale de jurnal ────────────────────────────────────────────────
  const journalConds = [`sm.org_id = ${org}`];
  if (channel) journalConds.push(`sm.channel = ${channel}`);
  if (filters.recipientType) journalConds.push(`sm.recipient_type = ${bind(filters.recipientType)}`);
  if (leadId) journalConds.push(`sm.lead_id = ${leadId}::uuid`);
  if (search) {
    journalConds.push(
      `(sm.recipient_name ILIKE ${search} OR sm.recipient_email ILIKE ${search} ` +
        `OR sm.recipient_phone ILIKE ${search} OR sm.subject ILIKE ${search} ` +
        `OR sm.template_title ILIKE ${search})`
    );
  }

  const journalSelect = `
    SELECT sm.id, sm.org_id, sm.sent_by, sm.channel, sm.recipient_type, sm.lead_id,
           sm.recipient_name, sm.recipient_email, sm.recipient_phone,
           sm.template_id, sm.template_title, sm.subject, sm.body,
           sm.status, sm.error, sm.created_at, 'journal'::text AS source,
           sm.message_id, sm.replied_at, sm.reply_message_id, sm.reply_subject, sm.reply_snippet
    FROM sent_messages sm
    WHERE ${journalConds.join(' AND ')}`;

  // ── Lead-uri pitch-uite fără linie de jurnal ─────────────────────────────
  // `status` și `pitch_channel` sunt enum-uri în DB → cast la text peste tot,
  // ca să meargă și comparațiile cu parametri, și UNION-ul cu jurnalul.
  const derivedConds = [
    `l.status::text IN ${PITCHED_LEAD_STATUSES}`,
    `NOT EXISTS (SELECT 1 FROM sent_messages j WHERE j.lead_id = l.id)`,
  ];
  if (channel) derivedConds.push(`l.pitch_channel::text = ${channel}`);
  if (leadId) derivedConds.push(`l.id = ${leadId}::uuid`);
  if (search) {
    derivedConds.push(
      `(l.company_name ILIKE ${search} OR l.contact_email ILIKE ${search} ` +
        `OR l.contact_phone ILIKE ${search} OR l.pitch_subject ILIKE ${search})`
    );
  }

  // org_id lipsește pe instalările fără migrarea de follow-up, iar lista de
  // lead-uri oricum nu e filtrată pe tenant — derivatele rămân ne-scopate.
  const derivedSelect = `
    SELECT l.id, NULL::text, NULL::text, l.pitch_channel::text, 'lead'::text, l.id,
           l.company_name, l.contact_email, l.contact_phone,
           NULL::text, 'Marcat ca trimis'::text, l.pitch_subject,
           COALESCE(l.pitch_generated, '')::text,
           'sent'::text, NULL::text, l.updated_at, 'lead'::text,
           NULL::text,
           CASE WHEN l.status::text IN ('replied', 'negotiating', 'won') THEN l.updated_at END,
           NULL::text, NULL::text, NULL::text
    FROM leads l
    WHERE ${derivedConds.join(' AND ')}`;

  // Filtrul „doar clienți” exclude prin definiție lead-urile derivate
  const includeDerived = filters.recipientType !== 'client';

  const limit = bind(Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT));

  const rows = await sql.query(
    `SELECT * FROM (
       ${journalSelect}
       ${includeDerived ? `UNION ALL ${derivedSelect}` : ''}
     ) AS m
     ORDER BY m.created_at DESC
     LIMIT ${limit}`,
    params
  );
  return (rows as unknown as Omit<SentMessage, 'gmail_url' | 'reply_gmail_url'>[]).map((m) => ({
    ...m,
    gmail_url: emailUrl(m),
    reply_gmail_url: m.reply_message_id ? gmailMessageUrl(m.reply_message_id) : null,
  }));
}

/**
 * Linkul spre emailul trimis: exact mesajul, după Message-ID; pentru
 * trimiterile vechi, fără Message-ID, o căutare în „Trimise” după destinatar.
 */
function emailUrl(m: Pick<SentMessage, 'channel' | 'status' | 'message_id' | 'recipient_email' | 'subject'>): string | null {
  if (m.channel !== 'email' || m.status !== 'sent') return null;
  if (m.message_id) return gmailMessageUrl(m.message_id);
  if (!m.recipient_email) return null;
  const subject = m.subject ? ` subject:"${m.subject.replace(/"/g, '')}"` : '';
  return gmailSearchUrl(`in:sent to:${m.recipient_email}${subject}`);
}

/** Prin ce canale a fost contactat un lead, conform jurnalului de trimiteri. */
export interface PitchSummary {
  /** Canalele distincte prin care a plecat cel puțin un mesaj reușit. */
  channels: string[];
  /** Data ultimei trimiteri reușite. */
  lastAt: string | null;
  /** Câte mesaje au plecat în total. */
  count: number;
}

/**
 * Sumarul trimiterilor pentru un set de lead-uri, într-o singură interogare.
 *
 * Se apelează cu id-urile paginii curente (max 100), nu cu toată baza. Dacă
 * tabela `sent_messages` lipsește (migrarea nerulată), întoarce o hartă goală
 * în loc să arunce: coloana „Pitched" rămâne goală, dar lista de lead-uri
 * continuă să se încarce.
 */
export async function getPitchSummaries(leadIds: string[]): Promise<Record<string, PitchSummary>> {
  if (leadIds.length === 0) return {};

  try {
    const rows = await sql`
      SELECT
        lead_id::text                                   AS lead_id,
        array_agg(DISTINCT channel)                     AS channels,
        max(created_at)                                 AS last_at,
        count(*)::int                                   AS count
      FROM sent_messages
      WHERE lead_id = ANY(${leadIds}::uuid[])
        AND status = 'sent'
      GROUP BY lead_id
    `;

    const summaries: Record<string, PitchSummary> = {};
    for (const row of rows as unknown as Array<{
      lead_id: string;
      channels: string[];
      last_at: string;
      count: number;
    }>) {
      summaries[row.lead_id] = {
        channels: row.channels ?? [],
        lastAt: row.last_at ?? null,
        count: row.count ?? 0,
      };
    }
    return summaries;
  } catch (error) {
    // 42P01 = undefined_table
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '42P01') {
      return {};
    }
    throw error;
  }
}
