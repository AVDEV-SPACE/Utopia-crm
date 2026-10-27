export type LeadStatus =
  | 'new'
  | 'scored'
  | 'pitch_ready'
  | 'sent'
  | 'replied'
  | 'negotiating'
  | 'won'
  | 'lost'
  // Stări produse de modulul AI Follow-Up (apel pierdut / formular pe site)
  | 'MISSED_CALL'
  | 'WEB_FORM';

export type PitchChannel = 'email' | 'instagram' | 'whatsapp';

export interface ScoreDetails {
  https: boolean;
  has_ssl: boolean;
  mobile_friendly: boolean;
  page_speed_mobile: number | null;
  page_speed_desktop: number | null;
  last_updated_estimate: string | null;
  response_time_ms: number | null;
  reachable: boolean;
}

export interface Lead {
  id: string;
  company_name: string;
  website: string | null;
  niche: string | null;
  location: string | null;
  score: number | null;
  score_details: ScoreDetails | null;
  contact_email: string | null;
  contact_instagram: string | null;
  contact_phone: string | null;
  pitch_generated: string | null;
  pitch_subject: string | null;
  pitch_channel: PitchChannel;
  status: LeadStatus;
  payment_link: string | null;
  notes: string | null;
  /** Tenant-ul proprietar (Clerk orgId) — null pentru lead-urile vechi */
  org_id: string | null;
  /** 'crm' | 'missed_call' | 'website' | 'sheet' | 'engine' */
  source: string;
  // ── Câmpuri populate din spreadsheet (source='sheet') ──────────────────────
  /** Clasificare din sheet, ex. „1st Page” / „Fără website” */
  category: string | null;
  address: string | null;
  opening_hours: string | null;
  /** Nota Google (0–5). Distinctă de `score`, care vine din PageSpeed. */
  rating: number | null;
  reviews_count: number | null;
  /** Ultimul import care a atins rândul */
  import_batch_id: string | null;
  service_desired: string | null;
  /** Referință externă unică (ex. Twilio CallSid), pentru idempotență */
  source_ref: string | null;
  // ── Pipeline de leaduri (source='engine') ───────────────────────────────────
  /** Etapa detaliată din pipeline (QUEUED_EMAIL, CONTACTED...); `status` e maparea ei */
  pipeline_stage: string | null;
  /** Segmentul ICP (A / B / C) */
  segment: string | null;
  icp_match: boolean | null;
  last_event_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Câmpurile CRM în care poate fi mapată o coloană dintr-un spreadsheet.
 * `company_name` e singurul obligatoriu — fără el rândul nu poate fi importat.
 */
export const IMPORTABLE_FIELDS = [
  'company_name',
  'location',
  'niche',
  'category',
  'contact_phone',
  'contact_email',
  'website',
  'address',
  'opening_hours',
  'rating',
] as const;

export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

/** Etichete pentru UI-ul de mapare a coloanelor. */
export const IMPORTABLE_FIELD_LABELS: Record<ImportableField, string> = {
  company_name: 'Nume firmă *',
  location: 'Oraș / Locație',
  niche: 'Nișă',
  category: 'Categorie',
  contact_phone: 'Telefon',
  contact_email: 'Email',
  website: 'Website',
  address: 'Adresă',
  opening_hours: 'Program',
  rating: 'Rating',
};

/**
 * Mapare coloană → câmp CRM, indexată după poziția coloanei în fișier.
 * `null` = coloana e ignorată la import.
 */
export type ImportMapping = Record<number, ImportableField | null>;

export interface ImportPreview {
  headers: string[];
  /** Maparea detectată automat, pe care utilizatorul o poate ajusta. */
  mapping: ImportMapping;
  sampleRows: string[][];
  totalRows: number;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  /** Rânduri sărite pentru că nu aveau nume de firmă. */
  skipped: number;
  batchId: string;
}

export interface NewLeadInput {
  company_name: string;
  website: string | null;
  niche: string;
  location: string;
  score: number;
  score_details: ScoreDetails;
  contact_email?: string | null;
  contact_phone?: string | null;
}
