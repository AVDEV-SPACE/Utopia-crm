/**
 * Import de lead-uri din spreadsheet — Google Sheets public, .csv sau .xlsx.
 *
 * Fluxul e în doi pași (vezi /api/leads/import):
 *   1. preview — parsăm, detectăm maparea coloanelor, arătăm primele rânduri
 *   2. commit  — normalizăm și facem upsert în `leads` cu source='sheet'
 *
 * Pasul de preview există pentru că fișierele reale au anteturi imprevizibile;
 * detecția automată acoperă cazurile comune, iar restul le mapează utilizatorul.
 */

import { sql } from '@/lib/neon';
import {
  IMPORTABLE_FIELDS,
  ImportableField,
  ImportMapping,
  ImportResult,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Parsare
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ghicește separatorul din primul rând care nu e prins între ghilimele.
 *
 * Excel cu locale românesc (sau german/francez) exportă CSV cu `;`, pentru că
 * virgula e separator zecimal. Fără detecția asta, un astfel de fișier ar fi
 * citit ca având o singură coloană uriașă.
 */
function sniffDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'));

  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t', '|']) {
    let count = 0;
    let inQuotes = false;
    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parser CSV minimal, conform RFC 4180 pe partea care contează aici: câmpuri
 * între ghilimele care pot conține separatorul și newline-uri, plus `""` ca escape.
 *
 * E scris de mână și nu adus ca dependință pentru că formatul e simplu, iar
 * sheet-urile de lead-uri chiar au virgule în celule (ex. programul de lucru:
 * "L-V 08:00-21:00, S 08:00-14:00") — un `split(',')` le-ar rupe în două.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  // BOM-ul pus de Excel la export ar intra altfel în primul antet
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = delimiter ?? sniffDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }

  // ultimul rând, dacă fișierul nu se termină cu newline
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // rândurile complet goale nu spun nimic
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Parsează un .xlsx din buffer. `exceljs` e încărcat leneș — e o dependință grea. */
async function parseXlsx(buffer: Buffer): Promise<string[][]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Fișierul .xlsx nu conține nicio foaie de calcul.');

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values: string[] = [];
    // `cellCount` include celulele goale din mijlocul rândului; iterăm pe index
    // ca să nu pierdem alinierea coloanelor când o celulă e necompletată.
    for (let i = 1; i <= sheet.columnCount; i++) {
      const cell = excelRow.getCell(i);
      values.push(cellToText(cell.value));
    }
    if (values.some((v) => v.trim() !== '')) rows.push(values);
  });

  return rows;
}

/** Valorile ExcelJS pot fi obiecte (formule, hyperlink-uri, rich text). */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const obj = value as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text;
  if (typeof obj.result === 'string' || typeof obj.result === 'number') return String(obj.result);
  if (typeof obj.hyperlink === 'string') return obj.hyperlink;
  if (Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text?: string }>).map((part) => part.text ?? '').join('');
  }
  return '';
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: string[][];
}

/** Alege parserul după extensie/conținut și separă antetul de date. */
export async function parseSpreadsheet(
  source: { buffer: Buffer; filename: string } | { text: string }
): Promise<ParsedSpreadsheet> {
  let all: string[][];

  if ('text' in source) {
    all = parseCsv(source.text);
  } else if (/\.xlsx?$/i.test(source.filename)) {
    all = await parseXlsx(source.buffer);
  } else {
    all = parseCsv(source.buffer.toString('utf8'));
  }

  if (all.length === 0) throw new Error('Fișierul este gol.');

  const [headers, ...rows] = all;
  return { headers: headers.map((h) => h.trim()), rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Detecția mapării
// ─────────────────────────────────────────────────────────────────────────────

/** Fără diacritice, lowercase, fără spații multiple — pentru potrivirea anteturilor. */
function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // taie diacriticele: Oras/Oraș devin identice
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Alias-uri de antet, în română și engleză. Prima potrivire câștigă, deci
 * variantele mai specifice („nume afacere”) stau înaintea celor generice („nume”).
 */
const HEADER_ALIASES: Array<[ImportableField, string[]]> = [
  ['company_name',  ['nume afacere', 'nume firma', 'denumire', 'firma', 'company', 'company name', 'business', 'business name', 'nume']],
  ['location',      ['oras', 'orasul', 'localitate', 'city', 'town', 'judet', 'locatie', 'location']],
  ['niche',         ['nisa', 'niche', 'domeniu', 'industrie', 'industry', 'vertical']],
  ['category',      ['categorie', 'category', 'clasificare', 'segment', 'tip']],
  ['contact_phone', ['telefon', 'tel', 'phone', 'mobil', 'numar telefon', 'phone number']],
  ['contact_email', ['email', 'e mail', 'mail', 'adresa email', 'email address']],
  ['website',       ['website', 'site', 'web', 'url', 'pagina web', 'domeniu web']],
  ['address',       ['adresa', 'address', 'strada', 'street']],
  ['opening_hours', ['program', 'orar', 'hours', 'opening hours', 'program de lucru']],
  ['rating',        ['rating', 'scor google', 'nota', 'recenzii', 'reviews', 'stele']],
];

/**
 * Mapează automat coloanele pe câmpuri CRM. Un câmp e atribuit o singură dată —
 * dacă două coloane se potrivesc la fel, o câștigă prima.
 */
export function detectMapping(headers: string[]): ImportMapping {
  const mapping: ImportMapping = {};
  const taken = new Set<ImportableField>();

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    mapping[index] = null;
    if (!normalized) return;

    for (const [field, aliases] of HEADER_ALIASES) {
      if (taken.has(field)) continue;
      // potrivire exactă întâi, apoi „conține” pentru anteturi de tip „Telefon fix”
      const hit = aliases.some((a) => normalized === a) || aliases.some((a) => normalized.includes(a));
      if (hit) {
        mapping[index] = field;
        taken.add(field);
        return;
      }
    }
  });

  return mapping;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizare
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedLead {
  company_name: string;
  location: string | null;
  niche: string | null;
  category: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  address: string | null;
  opening_hours: string | null;
  rating: number | null;
  reviews_count: number | null;
}

const blankToNull = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Site-urile apar în sheet fără schemă (`dentestet.ro`). Fără prefix, un
 * `<a href>` din tabel ar fi interpretat ca link relativ și ar duce în CRM.
 */
function normalizeWebsite(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^\/+|\/+$/g, '');
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

/**
 * Rating-ul vine ca „4.9 (194)” — notă plus număr de recenzii într-o singură
 * celulă. Le separăm ca să se poată sorta după oricare dintre ele.
 */
export function parseRating(raw: string | null): { rating: number | null; reviews_count: number | null } {
  if (!raw) return { rating: null, reviews_count: null };

  const ratingMatch = raw.match(/(\d+[.,]?\d*)/);
  const reviewsMatch = raw.match(/\(\s*([\d.,\s]+)\s*\)/);

  const rating = ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null;
  const reviews = reviewsMatch ? Number(reviewsMatch[1].replace(/[^\d]/g, '')) : null;

  return {
    rating: rating !== null && Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null,
    reviews_count: reviews !== null && Number.isFinite(reviews) ? reviews : null,
  };
}

/** Aplică maparea peste un rând brut. Întoarce `null` dacă rândul n-are nume. */
export function normalizeRow(row: string[], mapping: ImportMapping): NormalizedLead | null {
  const get = (field: ImportableField): string | null => {
    const index = Object.keys(mapping).find((key) => mapping[Number(key)] === field);
    if (index === undefined) return null;
    return blankToNull(row[Number(index)]);
  };

  const company_name = get('company_name');
  if (!company_name) return null;

  const { rating, reviews_count } = parseRating(get('rating'));

  return {
    company_name,
    location: get('location'),
    niche: get('niche'),
    category: get('category'),
    // Telefonul rămâne exact ca în sursă pentru afișare („0757 573 757”);
    // căutarea îl normalizează la cifre în SQL, vezi repository.findLeads.
    contact_phone: get('contact_phone'),
    contact_email: get('contact_email'),
    website: normalizeWebsite(get('website')),
    address: get('address'),
    opening_hours: get('opening_hours'),
    rating,
    reviews_count,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Sheets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transformă un link de Google Sheets în URL-ul de export CSV.
 * Funcționează pentru orice sheet partajat „anyone with the link”, fără
 * credențiale — de aceea importul nu are nevoie de service account.
 */
export function toCsvExportUrl(url: string): string {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    throw new Error('Link invalid — aștept un URL de forma https://docs.google.com/spreadsheets/d/...');
  }

  // gid identifică foaia din registru; poate apărea în query sau în fragment
  const gidMatch = url.match(/[#&?]gid=([0-9]+)/);
  const gid = gidMatch ? gidMatch[1] : '0';

  return `https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv&gid=${gid}`;
}

/** Descarcă un sheet public ca text CSV, cu erori explicite pentru cazul „nu e public”. */
export async function fetchSheetCsv(url: string): Promise<string> {
  const exportUrl = toCsvExportUrl(url);
  const res = await fetch(exportUrl, { redirect: 'follow', cache: 'no-store' });

  if (!res.ok) {
    throw new Error(
      `Nu am putut descărca sheet-ul (HTTP ${res.status}). Verifică în Share că e setat pe „Anyone with the link → Viewer”.`
    );
  }

  // Pentru un sheet privat Google nu dă 4xx: redirecționează spre pagina de
  // login și întoarce HTML cu status 200. Fără verificarea asta, parserul CSV
  // ar „reuși” pe HTML și ar produce un preview absurd în loc de o eroare clară.
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('csv')) {
    throw new Error(
      'Sheet-ul nu este public. Deschide-l → Share → Anyone with the link → Viewer, apoi încearcă din nou.'
    );
  }

  return res.text();
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert
// ─────────────────────────────────────────────────────────────────────────────

/** Loturi mici: driverul Neon trimite parametrii într-un singur statement. */
const BATCH_SIZE = 100;

/** Cast-uri pe poziție, în ordinea coloanelor din INSERT-ul de mai jos. */
const PARAM_CASTS = [
  '::text',    // company_name
  '::text',    // location
  '::text',    // niche
  '::text',    // category
  '::text',    // contact_phone
  '::text',    // contact_email
  '::text',    // website
  '::text',    // address
  '::text',    // opening_hours
  '::numeric', // rating
  '::int',     // reviews_count
  '::uuid',    // import_batch_id
] as const;

/**
 * Scrie lead-urile normalizate în `leads` cu source='sheet'.
 *
 * Conflictul se rezolvă pe (nume, oraș) — vezi indexul `uq_leads_sheet_identity`
 * din setup-db-leads-import.sql. La re-import actualizăm DOAR coloanele care vin
 * din sheet; `status`, `notes`, `pitch_generated`, `pitch_subject` și
 * `payment_link` rămân neatinse, altfel un re-sync ar șterge munca făcută pe lead.
 *
 * `COALESCE(EXCLUDED.x, leads.x)` face ca o celulă goală în sheet să păstreze
 * valoarea existentă în DB în loc s-o golească.
 */
export async function upsertSheetLeads(
  leads: NormalizedLead[],
  batchId: string
): Promise<Omit<ImportResult, 'skipped' | 'batchId'>> {
  let inserted = 0;
  let updated = 0;

  for (let start = 0; start < leads.length; start += BATCH_SIZE) {
    const batch = leads.slice(start, start + BATCH_SIZE);
    const params: unknown[] = [];

    const valueTuples = batch.map((lead) => {
      const row = [
        lead.company_name,
        lead.location,
        lead.niche,
        lead.category,
        lead.contact_phone,
        lead.contact_email,
        lead.website,
        lead.address,
        lead.opening_hours,
        lead.rating,
        lead.reviews_count,
        batchId,
      ];
      // Fiecare parametru primește cast explicit. Fără el, un lot în care o
      // coloană e `null` pe toate rândurile lasă Postgres fără niciun indiciu
      // de tip și statementul eșuează cu „could not determine data type”.
      const placeholders = row.map((value, i) => {
        params.push(value);
        return `$${params.length}${PARAM_CASTS[i]}`;
      });
      return `(${placeholders.join(', ')}, 'sheet', 'new')`;
    });

    // `xmax = 0` distinge un INSERT real de un UPDATE produs de ON CONFLICT:
    // pe rândurile nou inserate xmax e 0, pe cele actualizate e id-ul tranzacției.
    const rows = await sql.query(
      `INSERT INTO leads (
         company_name, location, niche, category,
         contact_phone, contact_email, website,
         address, opening_hours, rating, reviews_count,
         import_batch_id, source, status
       )
       VALUES ${valueTuples.join(', ')}
       ON CONFLICT (lower(company_name), lower(coalesce(location, ''))) WHERE source = 'sheet'
       DO UPDATE SET
         niche           = COALESCE(EXCLUDED.niche,           leads.niche),
         category        = COALESCE(EXCLUDED.category,        leads.category),
         contact_phone   = COALESCE(EXCLUDED.contact_phone,   leads.contact_phone),
         contact_email   = COALESCE(EXCLUDED.contact_email,   leads.contact_email),
         website         = COALESCE(EXCLUDED.website,         leads.website),
         address         = COALESCE(EXCLUDED.address,         leads.address),
         opening_hours   = COALESCE(EXCLUDED.opening_hours,   leads.opening_hours),
         rating          = COALESCE(EXCLUDED.rating,          leads.rating),
         reviews_count   = COALESCE(EXCLUDED.reviews_count,   leads.reviews_count),
         import_batch_id = EXCLUDED.import_batch_id,
         updated_at      = now()
       RETURNING (xmax = 0) AS is_insert`,
      params
    );

    for (const row of rows as unknown as Array<{ is_insert: boolean }>) {
      if (row.is_insert) inserted++;
      else updated++;
    }
  }

  return { inserted, updated };
}

/**
 * Pipeline complet: rânduri brute + mapare → lead-uri în DB.
 * Rândurile fără nume de firmă sunt numărate ca `skipped`, nu aruncă eroare —
 * un sheet real are aproape întotdeauna rânduri de separare sau totaluri.
 */
export async function importRows(
  rows: string[][],
  mapping: ImportMapping,
  batchId: string
): Promise<ImportResult> {
  const normalized: NormalizedLead[] = [];
  let skipped = 0;

  for (const row of rows) {
    const lead = normalizeRow(row, mapping);
    if (lead) normalized.push(lead);
    else skipped++;
  }

  // Un sheet poate conține aceeași firmă de două ori (același oraș). Postgres
  // refuză două rânduri cu aceeași cheie în ACELAȘI statement — „ON CONFLICT DO
  // UPDATE command cannot affect row a second time” — așa că deduplicăm înainte,
  // păstrând ultima apariție.
  const byIdentity = new Map<string, NormalizedLead>();
  for (const lead of normalized) {
    const key = `${lead.company_name.toLowerCase()}|${(lead.location ?? '').toLowerCase()}`;
    byIdentity.set(key, lead);
  }

  const { inserted, updated } = await upsertSheetLeads([...byIdentity.values()], batchId);
  return { inserted, updated, skipped, batchId };
}

/** Validează maparea trimisă de client. `company_name` e obligatoriu. */
export function validateMapping(mapping: ImportMapping): string | null {
  const fields = Object.values(mapping).filter(Boolean) as ImportableField[];

  if (!fields.includes('company_name')) {
    return 'Trebuie mapată o coloană pe „Nume firmă”.';
  }
  for (const field of fields) {
    if (!IMPORTABLE_FIELDS.includes(field)) return `Câmp necunoscut: ${field}`;
  }
  const duplicates = fields.filter((f, i) => fields.indexOf(f) !== i);
  if (duplicates.length > 0) {
    return `Câmpul „${duplicates[0]}” e mapat pe mai multe coloane.`;
  }
  return null;
}
