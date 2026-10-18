import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { sql } from '@/lib/neon';
import { mailboxCredentials } from '@/lib/messaging';

/** Cât de departe în urmă căutăm răspunsuri la emailurile trimise. */
const LOOKBACK_DAYS = 60;
/** Gmail limitează lungimea căutărilor X-GM-RAW — adresele merg în loturi. */
const ADDRESSES_PER_SEARCH = 20;
/** Sincronizările automate (la deschiderea tabelului) nu lovesc IMAP mai des de atât. */
const MIN_INTERVAL_MS = 60_000;
/** Lead-urile din aceste stări urcă la `replied`; cele mai avansate rămân neatinse. */
const UPGRADABLE_LEAD_STATUSES = "('new', 'scored', 'pitch_ready', 'sent')";

const lastSyncByOrg = new Map<string, number>();

export interface ReplySyncResult {
  /** Emailuri trimise care încă așteptau răspuns. */
  checked: number;
  /** Câte dintre ele au primit acum un răspuns. */
  matched: number;
  /** Sincronizare sărită: alta a rulat recent. */
  skipped?: boolean;
}

interface AwaitingRow {
  id: string;
  lead_id: string | null;
  recipient_email: string;
  message_id: string | null;
  created_at: string;
}

interface Reply {
  uid: number;
  from: string;
  date: Date;
  messageId: string | null;
  subject: string | null;
  /** In-Reply-To + References: Message-ID-urile la care răspunde. */
  refs: string[];
  /** Textul propriu-zis al răspunsului, fără citat — doar pentru cele potrivite. */
  snippet?: string;
}

const normId = (id: string) => id.trim().replace(/^<|>$/g, '').toLowerCase();

/** Ultimele rânduri citate (`> ...`, „On ... wrote:”) nu sunt răspunsul propriu-zis. */
function replySnippet(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) break;
    if (/^\s*(On|Pe|În|Le|Am)\s.+(wrote|a scris|écrit|schrieb)/i.test(line)) break;
    lines.push(line);
  }
  return lines.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}

/**
 * Caută în căsuța Gmail răspunsuri la emailurile trimise din CRM și le
 * marchează în `sent_messages` (+ lead-ul aferent trece pe `replied`).
 *
 * Potrivirea: întâi după In-Reply-To / References (Message-ID-ul salvat la
 * trimitere), apoi — pentru trimiterile vechi, fără Message-ID — după
 * expeditor: primul mesaj primit de la destinatar după trimitere.
 */
export async function syncEmailReplies(orgId: string, opts: { force?: boolean } = {}): Promise<ReplySyncResult> {
  const now = Date.now();
  if (!opts.force && now - (lastSyncByOrg.get(orgId) ?? 0) < MIN_INTERVAL_MS) {
    return { checked: 0, matched: 0, skipped: true };
  }
  lastSyncByOrg.set(orgId, now);

  const rows = (await sql`
    SELECT id::text, lead_id::text, LOWER(recipient_email) AS recipient_email, message_id, created_at
    FROM sent_messages
    WHERE org_id = ${orgId}
      AND channel = 'email' AND status = 'sent' AND replied_at IS NULL
      AND recipient_email IS NOT NULL
      AND created_at > NOW() - make_interval(days => ${LOOKBACK_DAYS})
    ORDER BY created_at
  `) as unknown as AwaitingRow[];
  if (rows.length === 0) return { checked: 0, matched: 0 };

  const { user, pass } = mailboxCredentials();
  if (!pass) throw new Error('Email neconfigurat: adaugă GMAIL_APP_PASSWORD în .env');

  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();

  const matches = new Map<string, Reply>();
  try {
    // „Toate mesajele” prinde și răspunsurile arhivate; numele e localizat,
    // deci folderul se găsește după rolul lui (\All), nu după nume.
    const folders = await client.list();
    const allMail = folders.find((f) => f.specialUse === '\\All')?.path ?? 'INBOX';
    const lock = await client.getMailboxLock(allMail);
    try {
      const own = user.toLowerCase();
      const addresses = Array.from(new Set(rows.map((r) => r.recipient_email))).filter((a) => a !== own);
      const oldest = new Date(rows[0].created_at);
      const after = `${oldest.getFullYear()}/${oldest.getMonth() + 1}/${oldest.getDate()}`;

      const replies: Reply[] = [];
      for (let i = 0; i < addresses.length; i += ADDRESSES_PER_SEARCH) {
        const batch = addresses.slice(i, i + ADDRESSES_PER_SEARCH);
        const uids = await client.search(
          { gmraw: `from:(${batch.join(' OR ')}) after:${after}` },
          { uid: true }
        );
        if (!uids || uids.length === 0) continue;

        for await (const msg of client.fetch(uids, { envelope: true, headers: ['references'] }, { uid: true })) {
          const env = msg.envelope;
          const from = env?.from?.[0]?.address?.toLowerCase();
          if (!env || !from || !env.date) continue;
          const references = msg.headers?.toString().replace(/^references:\s*/i, '') ?? '';
          replies.push({
            uid: msg.uid,
            from,
            date: new Date(env.date),
            messageId: env.messageId ?? null,
            subject: env.subject ?? null,
            refs: [env.inReplyTo ?? '', ...references.split(/\s+/)].filter(Boolean).map(normId),
          });
        }
      }

      // Cel mai vechi răspuns întâi: fiecare trimitere primește primul răspuns de după ea
      replies.sort((a, b) => a.date.getTime() - b.date.getTime());
      for (const reply of replies) {
        const byThread = rows.find((r) => r.message_id && reply.refs.includes(normId(r.message_id)) && !matches.has(r.id));
        const bySender = byThread
          ? null
          : [...rows]
              .reverse()
              .find((r) => r.recipient_email === reply.from && new Date(r.created_at) < reply.date && !matches.has(r.id));
        const row = byThread ?? bySender;
        if (row) matches.set(row.id, reply);
      }

      // Textul doar pentru răspunsurile potrivite — puține, deci câte un fetch
      for (const reply of matches.values()) {
        const msg = await client.fetchOne(String(reply.uid), { source: true }, { uid: true });
        if (msg && msg.source) {
          const parsed = await simpleParser(msg.source);
          reply.snippet = replySnippet(parsed.text ?? '');
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  const leadIds = new Set<string>();
  for (const [rowId, reply] of matches) {
    const snippet = reply.snippet ?? null;
    await sql`
      UPDATE sent_messages
      SET replied_at = ${reply.date.toISOString()}, reply_message_id = ${reply.messageId},
          reply_subject = ${reply.subject}, reply_snippet = ${snippet}
      WHERE id = ${rowId}::uuid
    `;
    const leadId = rows.find((r) => r.id === rowId)?.lead_id;
    if (leadId) leadIds.add(leadId);
  }

  if (leadIds.size > 0) {
    await sql.query(
      `UPDATE leads SET status = 'replied', updated_at = NOW()
       WHERE id = ANY($1::uuid[]) AND status::text IN ${UPGRADABLE_LEAD_STATUSES}`,
      [Array.from(leadIds)]
    );
  }

  return { checked: rows.length, matched: matches.size };
}
