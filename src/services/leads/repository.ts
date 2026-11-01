import { sql } from '@/lib/neon';
import { Lead, LeadStatus, NewLeadInput, PitchChannel } from './types';

export async function listLeads(): Promise<Lead[]> {
  const rows = await sql`
    SELECT * FROM leads ORDER BY created_at DESC
  `;
  return rows as unknown as Lead[];
}

export interface LeadFilters {
  /** Text liber: nume, oraș, telefon, email, website, nișă, adresă. */
  q?: string;
  /** Păstrează doar lead-urile cu această sursă (ex. 'sheet'). */
  source?: string;
  /** Exclude una sau mai multe surse (listă cu virgulă) — /lead-generation exclude importurile și motorul. */
  excludeSource?: string;
  niche?: string;
  location?: string;
  category?: string;
  /** Rating Google minim (0–5). Ignorat dacă `withoutRating` e activ. */
  minRating?: number;
  /** Doar lead-urile fără rating completat. */
  withoutRating?: boolean;
  /** Scor PageSpeed minim (0–100). Ignorat dacă `withoutScore` e activ. */
  minScore?: number;
  /** Limita superioară a scorului, pentru intervale de tip 40–69. */
  maxScore?: number;
  /** Doar lead-urile fără scor calculat. */
  withoutScore?: boolean;
  limit?: number;
  offset?: number;
}

export interface LeadPage {
  rows: Lead[];
  /** Numărul total de potriviri, ignorând limit/offset. */
  total: number;
}

/**
 * Listare + căutare + filtrare, cu paginare.
 *
 * Un singur punct de intrare pentru toate consumatoarele: bara de căutare din
 * header (limită mică), /leads (filtre + paginare) și /lead-generation.
 */
export async function findLeads(filters: LeadFilters = {}): Promise<LeadPage> {
  const { q, source, excludeSource, niche, location, category } = filters;
  // Plafonul e generos pentru că /lead-generation filtrează client-side și are
  // nevoie de lista întreagă — înainte folosea un listLeads() nelimitat.
  const limit = Math.min(Math.max(filters.limit ?? 1000, 1), 1000);
  const offset = Math.max(filters.offset ?? 0, 0);

  const where: string[] = [];
  const params: unknown[] = [];
  const push = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (source) where.push(`source = ${push(source)}`);
  if (excludeSource) {
    const excluded = excludeSource.split(',').map((s) => s.trim()).filter(Boolean);
    if (excluded.length > 0) where.push(`source <> ALL(${push(excluded)}::text[])`);
  }
  if (niche) where.push(`niche = ${push(niche)}`);
  if (location) where.push(`location = ${push(location)}`);
  if (category) where.push(`category = ${push(category)}`);

  // Rating și scor măsoară lucruri diferite (nota Google vs. PageSpeed), deci
  // se filtrează independent; „fără valoare" e o opțiune distinctă de un prag.
  if (filters.withoutRating) where.push('rating IS NULL');
  else if (typeof filters.minRating === 'number') where.push(`rating >= ${push(filters.minRating)}`);

  if (filters.withoutScore) where.push('score IS NULL');
  else {
    if (typeof filters.minScore === 'number') where.push(`score >= ${push(filters.minScore)}`);
    if (typeof filters.maxScore === 'number') where.push(`score <= ${push(filters.maxScore)}`);
  }

  const term = q?.trim();
  if (term) {
    const digits = term.replace(/\D/g, '');

    // Telefoanele sunt stocate exact ca în sursă — „0757 573 757”, „+40 359 178
    // 678” — deci un ILIKE pe textul căutat nu prinde nimic dacă utilizatorul
    // tastează numărul fără spații (sau invers). Comparăm pe cifrele goale de
    // ambele părți, ca forma introdusă să nu mai conteze.
    const phoneClause =
      digits.length >= 4
        ? ` OR regexp_replace(coalesce(contact_phone, ''), '\\D', '', 'g') LIKE ${push(`%${digits}%`)}`
        : '';

    const like = push(`%${term}%`);
    where.push(
      `(company_name ILIKE ${like}
        OR location ILIKE ${like}
        OR niche ILIKE ${like}
        OR category ILIKE ${like}
        OR contact_email ILIKE ${like}
        OR contact_instagram ILIKE ${like}
        OR website ILIKE ${like}
        OR address ILIKE ${like}
        OR contact_phone ILIKE ${like}${phoneClause})`
    );
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // `count(*) OVER ()` dă totalul într-o singură interogare, fără un SELECT
  // count separat care ar trebui ținut în sincron cu aceleași filtre.
  // `id` la final e obligatoriu, nu cosmetic: un import scrie sute de rânduri cu
  // același `created_at`, iar fără un criteriu care le departajează ordinea la
  // egalitate nu e stabilă între interogări — paginile consecutive ar repeta
  // unele lead-uri și ar sări peste altele.
  const prefixParam = term ? push(`${term}%`) : null;
  const orderSql = prefixParam
    ? `ORDER BY CASE WHEN company_name ILIKE ${prefixParam} THEN 0 ELSE 1 END, created_at DESC, id DESC`
    : 'ORDER BY created_at DESC, id DESC';

  const rows = await sql.query(
    `SELECT *, count(*) OVER () AS total_count
     FROM leads
     ${whereSql}
     ${orderSql}
     LIMIT ${push(limit)} OFFSET ${push(offset)}`,
    params
  );

  const list = rows as unknown as Array<Lead & { total_count: string }>;
  const total = list.length > 0 ? Number(list[0].total_count) : 0;

  return {
    rows: list.map(({ total_count: _total, ...lead }) => lead as Lead),
    total,
  };
}

/**
 * Căutare simplă după nume, email, telefon, website, nișă sau locație.
 * Folosită de bara de căutare din header.
 */
export async function searchLeads(query: string, limit = 20): Promise<Lead[]> {
  const { rows } = await findLeads({ q: query, limit });
  return rows;
}

export interface LeadFacets {
  locations: string[];
  niches: string[];
  categories: string[];
  /** Sursele prezente în date: 'sheet', 'crm', 'missed_call', 'website'. */
  sources: string[];
}

/**
 * Valorile distincte pentru chips-urile de filtrare din /leads.
 *
 * Interogare separată de listare pentru că filtrarea e server-side: opțiunile
 * trebuie să acopere tot setul, nu doar pagina încărcată în acel moment.
 */
export async function getLeadFacets(source?: string): Promise<LeadFacets> {
  // Fără sursă => fațetele acoperă toate lead-urile (lista combinată din /leads).
  const rows = source
    ? await sql`
        SELECT
          array_agg(DISTINCT location) FILTER (WHERE location IS NOT NULL) AS locations,
          array_agg(DISTINCT niche)    FILTER (WHERE niche    IS NOT NULL) AS niches,
          array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories,
          array_agg(DISTINCT source)   FILTER (WHERE source   IS NOT NULL) AS sources
        FROM leads
        WHERE source = ${source}
      `
    : await sql`
        SELECT
          array_agg(DISTINCT location) FILTER (WHERE location IS NOT NULL) AS locations,
          array_agg(DISTINCT niche)    FILTER (WHERE niche    IS NOT NULL) AS niches,
          array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories,
          array_agg(DISTINCT source)   FILTER (WHERE source   IS NOT NULL) AS sources
        FROM leads
      `;
  const row = rows[0] as unknown as {
    locations: string[] | null;
    niches: string[] | null;
    categories: string[] | null;
    sources: string[] | null;
  };

  const sorted = (values: string[] | null) => (values ?? []).slice().sort((a, b) => a.localeCompare(b, 'ro'));

  return {
    locations: sorted(row?.locations ?? null),
    niches: sorted(row?.niches ?? null),
    categories: sorted(row?.categories ?? null),
    sources: sorted(row?.sources ?? null),
  };
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const rows = await sql`
    SELECT * FROM leads WHERE id = ${id}
  `;
  return (rows[0] as unknown as Lead) ?? null;
}

export async function insertLead(input: NewLeadInput): Promise<Lead> {
  const rows = await sql`
    INSERT INTO leads (
      company_name, website, niche, location, score, score_details,
      contact_email, contact_phone, status
    ) VALUES (
      ${input.company_name}, ${input.website}, ${input.niche}, ${input.location},
      ${input.score}, ${JSON.stringify(input.score_details)},
      ${input.contact_email ?? null}, ${input.contact_phone ?? null}, 'scored'
    )
    RETURNING *
  `;
  return rows[0] as unknown as Lead;
}

export interface ManualLeadInput {
  company_name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  niche?: string | null;
  location?: string | null;
}

// Adăugare manuală de lead/potențial client (fără scanare/scoring), din UI-ul CRM.
export async function createManualLead(input: ManualLeadInput): Promise<Lead> {
  const rows = await sql`
    INSERT INTO leads (company_name, niche, location, contact_email, contact_phone, status)
    VALUES (
      ${input.company_name}, ${input.niche ?? null}, ${input.location ?? null},
      ${input.contact_email ?? null}, ${input.contact_phone ?? null}, 'new'
    )
    RETURNING *
  `;
  return rows[0] as unknown as Lead;
}

export interface AutomationLeadInput {
  org_id: string;
  company_name: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  service_desired?: string | null;
  /** 'new' = contact din Facebook / Instagram (/socials) */
  status: 'MISSED_CALL' | 'WEB_FORM' | 'new';
  /** 'missed_call' | 'website' | 'facebook' | 'instagram' | ... — de unde a intrat lead-ul */
  source: string;
  /** Referință externă unică (ex. Twilio CallSid) pentru idempotență */
  source_ref?: string | null;
  notes?: string | null;
}

/**
 * Lead creat de o automatizare (apel pierdut, formular de pe site).
 *
 * Întoarce `null` când `source_ref` a mai fost procesat — Twilio repetă
 * status callback-urile, iar apelantul folosește asta ca să nu trimită de două
 * ori același SMS.
 */
export async function createAutomationLead(input: AutomationLeadInput): Promise<Lead | null> {
  const rows = await sql`
    INSERT INTO leads (
      org_id, company_name, contact_phone, contact_email,
      service_desired, status, source, source_ref, notes
    ) VALUES (
      ${input.org_id}, ${input.company_name}, ${input.contact_phone ?? null},
      ${input.contact_email ?? null}, ${input.service_desired ?? null},
      ${input.status}, ${input.source}, ${input.source_ref ?? null}, ${input.notes ?? null}
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
    RETURNING *
  `;
  return (rows[0] as unknown as Lead) ?? null;
}

/** Coloanele pe care UI-ul are voie să le modifice. */
export const EDITABLE_LEAD_COLUMNS = [
  'company_name',
  'website',
  'niche',
  'location',
  'contact_email',
  'contact_instagram',
  'contact_phone',
  'status',
  'notes',
  'pitch_generated',
  'pitch_subject',
  'pitch_channel',
  'payment_link',
  // Câmpuri venite din import, editabile manual după aceea
  'category',
  'address',
  'opening_hours',
] as const;

export type EditableLeadColumn = (typeof EDITABLE_LEAD_COLUMNS)[number];

export interface LeadPatch {
  company_name?: string;
  website?: string | null;
  niche?: string | null;
  location?: string | null;
  contact_email?: string | null;
  contact_instagram?: string | null;
  contact_phone?: string | null;
  status?: LeadStatus;
  notes?: string | null;
  pitch_generated?: string | null;
  pitch_subject?: string | null;
  pitch_channel?: PitchChannel;
  payment_link?: string | null;
  category?: string | null;
  address?: string | null;
  opening_hours?: string | null;
}

/**
 * Actualizare parțială reală: scrie DOAR cheile prezente în `patch`.
 *
 * Varianta anterioară folosea `COALESCE(param, coloană)`, ceea ce făcea
 * imposibilă golirea unui câmp — trimiterea lui `null` păstra vechea valoare.
 * Un formular de editare trebuie să poată șterge un email sau un telefon, deci
 * distingem „cheie absentă" (nu se atinge) de „null" (se golește).
 */
export async function updateLead(id: string, patch: LeadPatch): Promise<Lead | null> {
  const columns = EDITABLE_LEAD_COLUMNS.filter(
    (col) => Object.prototype.hasOwnProperty.call(patch, col) && patch[col] !== undefined
  );

  if (columns.length === 0) return getLeadById(id);

  const params: unknown[] = [];
  const assignments = columns.map((col) => {
    params.push(patch[col] ?? null);
    return `${col} = $${params.length}`;
  });
  params.push(id);

  // `status` și `pitch_channel` sunt enum-uri în DB: parametrul își ia tipul
  // din coloana țintă, deci nu are nevoie de cast explicit.
  const rows = await sql.query(
    `UPDATE leads SET ${assignments.join(', ')}, updated_at = now()
     WHERE id = $${params.length}::uuid
     RETURNING *`,
    params
  );
  return (rows[0] as unknown as Lead) ?? null;
}

/**
 * Șterge definitiv un lead. Notele lui dispar odată cu el (FK ON DELETE
 * CASCADE), dar jurnalul din `sent_messages` rămâne intact: mesajele chiar au
 * fost trimise, iar `lead_id` e ținut acolo fără cheie externă tocmai ca
 * istoricul să supraviețuiască ștergerii.
 *
 * Întoarce `false` dacă id-ul nu există.
 */
export async function deleteLead(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM leads WHERE id = ${id}::uuid RETURNING id`;
  return rows.length > 0;
}
