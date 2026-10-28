import type { Lead } from '@/services/leads/types';

/** Semnalele de marketing detectate de motor pe site-ul / profilele firmei. */
export interface PipelineSignals {
  metaPixel?: boolean | null;
  googleAds?: boolean | null;
  activeOnSocial?: boolean | null;
  icpMatch?: boolean | null;
  // ── Detectate de motor (src/services/engine/signals.ts) ────────────────────
  /** Site-ul s-a încărcat (HTML > 500 caractere). Fără el nu afirmăm nimic despre site. */
  siteLoaded?: boolean | null;
  gtag?: boolean | null;
  booking?: boolean | null;
  chat?: boolean | null;
  viewport?: boolean | null;
  https?: boolean | null;
  copyrightYear?: number | null;
  /** Reclame active în Meta Ad Library (RO) */
  hasActiveMetaAds?: boolean | null;
  investsInMarketing?: boolean | null;
}

/**
 * Ce păstrăm din datele pipeline-ului în `leads.score_details` (jsonb). Lead-urile
 * scanate au acolo ScoreDetails (PageSpeed) — forma diferă după `source`.
 */
export interface PipelineScoreDetails {
  reason: string | null;
  segment: string | null;
  icpMatch: boolean | null;
  signals: PipelineSignals | null;
  audit: { issues?: string[] } | null;
  social: { instagram?: string | null; facebook?: string | null; linkedin?: string | null } | null;
  linkedinDm: string | null;
  instagramDm: string | null;
  emailSource: string | null;
  /** Sursa din care a fost extrasă firma (ex. „openstreetmap") */
  source: string | null;
  /** Prima frază a pitch-ului (motor), pornind de la un fapt verificat */
  firstLine?: string | null;
  /** Ce s-a aflat la descoperire, înainte de îmbogățire (motor) */
  discovery?: EngineDiscovery | null;
}

/** Datele de descoperire ale unui lead din motor, păstrate în score_details. */
export interface EngineDiscovery {
  /** 'overture' | 'openstreetmap' | 'meta_ad_library' | 'google_places' | 'csv' */
  source: string;
  /** Id-ul în sursă (ex. „node/123", id-ul paginii Facebook, place id) */
  externalId: string | null;
  hasActiveMetaAds: boolean;
  metaPageId: string | null;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
}

/** Un lead din pipeline (motor sau import), după validare. */
export interface PipelineLeadInput {
  key: string;
  name: string;
  niche: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  emailSource: string | null;
  source: string | null;
  segment: string | null;
  icpScore: number | null;
  /** Etapa propusă de sursă, deja normalizată */
  stage: string | null;
  signals: PipelineSignals | null;
  audit: { issues?: string[] } | null;
  social: { instagram?: string | null; facebook?: string | null } | null;
  ai: {
    subject?: string | null;
    email_body?: string | null;
    linkedin_dm?: string | null;
    instagram_dm?: string | null;
    score_reason?: string | null;
  } | null;
}

export interface PipelineUpsertResult {
  id: string;
  key: string;
  stage: string;
  created: boolean;
  skipOutreach: boolean;
}

/** Un eveniment de outreach (din motor, din import sau manual din CRM). */
export interface PipelineEventInput {
  key: string | null;
  email: string | null;
  channel: string | null;
  event: string;
  stage: string | null;
  campaignId: string | null;
  replyText: string | null;
  occurredAt: Date | null;
  payload: unknown;
}

export interface PipelineEventResult {
  matched: boolean;
  leadId: string | null;
  previousStage: string | null;
  stage: string | null;
}

export interface PipelineEvent {
  id: string;
  lead_id: string | null;
  source_ref: string | null;
  email: string | null;
  channel: string | null;
  event: string;
  stage: string | null;
  campaign_id: string | null;
  reply_text: string | null;
  payload: unknown;
  occurred_at: string;
  created_at: string;
}

/** Rândul din tabelul /pipeline — doar coloanele afișate. */
export type PipelineLeadRow = Pick<
  Lead,
  | 'id'
  | 'company_name'
  | 'niche'
  | 'location'
  | 'website'
  | 'score'
  | 'status'
  | 'contact_email'
  | 'contact_phone'
  | 'contact_instagram'
  | 'source_ref'
  | 'pipeline_stage'
  | 'segment'
  | 'icp_match'
  | 'last_event_at'
  | 'created_at'
  | 'updated_at'
>;

export interface PipelineFilters {
  q?: string;
  stage?: string;
  segment?: string;
  icp?: boolean;
  city?: string;
  sort?: 'score' | 'date';
  limit?: number;
  offset?: number;
}

/** Indicatorii de sus de pe /pipeline (peste toate lead-urile din pipeline, fără filtre). */
export interface PipelineKpi {
  total: number;
  icpMatch: number;
  segmentA: number;
  queuedEmail: number;
  replied: number;
  callBooked: number;
  won: number;
}

export interface PipelineFacets {
  cities: string[];
  segments: string[];
  stages: string[];
}

export interface PipelinePage {
  rows: PipelineLeadRow[];
  total: number;
  kpi: PipelineKpi;
  facets: PipelineFacets;
}
