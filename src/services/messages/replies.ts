import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { sql } from '@/lib/neon';
import { mailboxCredentials } from '@/lib/messaging';
import { parseBounce, type Bounce } from '@/services/outreach/bounce';

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

export const normId = (id: string) => id.trim().replace(/^<|>$/g, '').toLowerCase();

/** Lungimea maximă a textului unui email primit, păstrat în conversație. */
const MAX_REPLY_TEXT = 4_000;

const QUOTE_HEADER = /^\s*(On|Pe|În|Le|Am)\s.+(wrote|a scris|écrit|schrieb)/i;

/**
 * Textul propriu-zis al unui răspuns, cu rândurile lui: se oprește la citat
 * (`> ...`, „On ... wrote:” — pe care Gmail îl rupe uneori pe două rânduri).
 */
function replyText(text: string): string {
  const all = text.split(/\r?\n/);
  const lines: string[] = [];
  for (let i = 0; i < all.length; i++) {
    const line = all[i];
    if (/^\s*>/.test(line)) break;
    if (QUOTE_HEADER.test(line) || QUOTE_HEADER.test(`${line} ${all[i + 1] ?? ''}`)) break;
    lines.push(line);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_REPLY_TEXT);
}

/** Varianta pe un rând, pentru jurnalul „Mesaje trimise”. */
const replySnippet = (text: string) => replyText(text).replace(/\s+/g, ' ').slice(0, 400);

/** Un email primit de la un lead, pentru conversație și clasificare. */
export interface InboundEmail {
  messageId: string;
  from: string;
  date: Date;
  subject: string | null;
  /** Textul răspunsului, fără citat */
  text: string;
}

/** Date IMAP: Gmail caută după zi. */
const gmailDate = (d: Date) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;

/**
 * Toate emailurile primite de la aceste adrese după `since` — nu doar primul
 * răspuns la un email trimis: conversația cu un lead continuă în fir.
 * `skip` = Message-ID-uri deja înregistrate, al căror conținut nu se mai descarcă.
 *
 * Propria adresă (lead-ul de test): contează doar mesajele tale din firul unui
 * email trimis de CRM, nu emailurile trimise de CRM și nici alte notițe către tine.
 */
export async function fetchInboundEmails(addresses: string[], since: Date, skip: Set<string>): Promise<InboundEmail[]> {
  if (addresses.length === 0) return [];
  const { user, pass } = mailboxCredentials();
  if (!pass) throw new Error('Email neconfigurat: adaugă GMAIL_APP_PASSWORD în .env');

  const own = user.toLowerCase();
  const external = Array.from(new Set(addresses.map((a) => a.toLowerCase()))).filter((a) => a !== own);
  const toSelf = addresses.some((a) => a.toLowerCase() === own);
  const ownSent = new Set<string>();
  if (toSelf) {
    const sent = await sql`
      SELECT message_id FROM sent_messages
      WHERE channel = 'email' AND LOWER(recipient_email) = ${own} AND message_id IS NOT NULL
        AND created_at > NOW() - make_interval(days => ${LOOKBACK_DAYS})
    `;
    for (const s of sent) ownSent.add(normId(s.message_id as string));
  }

  const queries: string[] = [];
  for (let i = 0; i < external.length; i += ADDRESSES_PER_SEARCH) {
    queries.push(`from:(${external.slice(i, i + ADDRESSES_PER_SEARCH).join(' OR ')}) after:${gmailDate(since)}`);
  }
  if (toSelf) queries.push(`from:(${own}) to:(${own}) after:${gmailDate(since)}`);

  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();

  const found: (Omit<InboundEmail, 'text'> & { uid: number })[] = [];
  const result: InboundEmail[] = [];
  try {
    const folders = await client.list();
    const allMail = folders.find((f) => f.specialUse === '\\All')?.path ?? 'INBOX';
    const lock = await client.getMailboxLock(allMail);
    try {
      const seen = new Set<string>();
      for (const query of queries) {
        const uids = await client.search({ gmraw: query }, { uid: true });
        if (!uids || uids.length === 0) continue;

        for await (const msg of client.fetch(uids, { envelope: true, headers: ['references'] }, { uid: true })) {
          const env = msg.envelope;
          const from = env?.from?.[0]?.address?.toLowerCase();
          if (!env || !from || !env.date || !env.messageId) continue;
          const id = normId(env.messageId);
          if (skip.has(id) || seen.has(id) || new Date(env.date) < since) continue;
          if (from === own) {
            const references = msg.headers?.toString().replace(/^references:\s*/i, '') ?? '';
            const refs = [env.inReplyTo ?? '', ...references.split(/\s+/)].filter(Boolean).map(normId);
            if (ownSent.has(id) || !refs.some((r) => ownSent.has(r))) continue;
          }
          seen.add(id);
          found.push({ uid: msg.uid, messageId: env.messageId, from, date: new Date(env.date), subject: env.subject ?? null });
        }
      }

      for (const email of found) {
        const msg = await client.fetchOne(String(email.uid), { source: true }, { uid: true });
        const parsed = msg && msg.source ? await simpleParser(msg.source) : null;
        result.push({
          messageId: email.messageId,
          from: email.from,
          date: email.date,
          subject: email.subject,
          text: replyText(parsed?.text ?? ''),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return result.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Un raport de nelivrare găsit în căsuță. */
export interface BounceEmail extends Bounce {
  messageId: string;
  date: Date;
}

/**
 * Rapoartele de nelivrare primite după `since`, cele mai noi întâi. Vin de la
 * `mailer-daemon`, deci nu apar în căutările de răspunsuri, care merg după adresa lead-ului.
 * `skip` = Message-ID-uri deja procesate, al căror conținut nu se mai descarcă.
 */
export async function fetchBounces(since: Date, skip: Set<string>, limit: number): Promise<BounceEmail[]> {
  const { user, pass } = mailboxCredentials();
  if (!pass) throw new Error('Email neconfigurat: adaugă GMAIL_APP_PASSWORD în .env');

  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();

  const result: BounceEmail[] = [];
  try {
    const folders = await client.list();
    const allMail = folders.find((f) => f.specialUse === '\\All')?.path ?? 'INBOX';
    const lock = await client.getMailboxLock(allMail);
    try {
      const uids = await client.search({ gmraw: `from:(mailer-daemon OR postmaster) after:${gmailDate(since)}` }, { uid: true });
      if (!uids || uids.length === 0) return result;

      const found: { uid: number; messageId: string; date: Date }[] = [];
      for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
        const env = msg.envelope;
        if (!env?.messageId || !env.date || skip.has(normId(env.messageId))) continue;
        found.push({ uid: msg.uid, messageId: env.messageId, date: new Date(env.date) });
      }
      found.sort((a, b) => b.date.getTime() - a.date.getTime());

      for (const email of found.slice(0, limit)) {
        const msg = await client.fetchOne(String(email.uid), { source: true }, { uid: true });
        const bounce = msg && msg.source ? parseBounce(msg.source.toString('utf8')) : null;
        if (bounce) result.push({ ...bounce, messageId: email.messageId, date: email.date });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return result;
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

  // Trimiterile către propria căsuță (lead-ul de test): emailurile trimise de CRM
  // apar și ele în căutare, cu tine ca expeditor — nu sunt răspunsuri
  const own = user.toLowerCase();
  const toSelf = rows.some((r) => r.recipient_email === own);
  const ownSent = new Set<string>();
  if (toSelf) {
    const sent = await sql`
      SELECT message_id FROM sent_messages
      WHERE org_id = ${orgId} AND channel = 'email' AND LOWER(recipient_email) = ${own}
        AND message_id IS NOT NULL AND created_at > NOW() - make_interval(days => ${LOOKBACK_DAYS})
    `;
    for (const s of sent) ownSent.add(normId(s.message_id as string));
  }

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
      const addresses = Array.from(new Set(rows.map((r) => r.recipient_email))).filter((a) => a !== own);
      const oldest = new Date(rows[0].created_at);
      const after = `${oldest.getFullYear()}/${oldest.getMonth() + 1}/${oldest.getDate()}`;

      const queries: string[] = [];
      for (let i = 0; i < addresses.length; i += ADDRESSES_PER_SEARCH) {
        queries.push(`from:(${addresses.slice(i, i + ADDRESSES_PER_SEARCH).join(' OR ')}) after:${after}`);
      }
      // Propria adresă: doar mesajele tale către tine, nu tot ce ai trimis
      if (toSelf) queries.push(`from:(${own}) to:(${own}) after:${after}`);

      const replies: Reply[] = [];
      for (const query of queries) {
        const uids = await client.search({ gmraw: query }, { uid: true });
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
        const fromSelf = reply.from === own;
        if (fromSelf && reply.messageId && ownSent.has(normId(reply.messageId))) continue;
        const byThread = rows.find((r) => r.message_id && reply.refs.includes(normId(r.message_id)) && !matches.has(r.id));
        // De la tine, expeditorul nu spune nimic: doar răspunsurile din fir contează
        const bySender = byThread || fromSelf
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
