import type { EngineDiscovery } from '@/services/pipeline/types';

/** Sursele cu care intră lead-urile motorului în `leads.source`. */
export type EngineLeadSource = 'engine' | 'linkedin';

/** Un candidat găsit la descoperire, înainte de deduplicare. */
export interface EngineCandidate {
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  niche: string | null;
  city: string | null;
  discovery: EngineDiscovery;
}

export interface EngineSettings {
  niches: string[];
  cities: string[];
  /** Valoarea din DB; `null` = env ENGINE_MAX_NEW_LEADS_PER_DAY */
  max_new_per_day: number | null;
  enrich_batch: number;
  min_score: number;
  cursor_pos: number;
  updated_at: string;
}

export interface EngineRun {
  id: string;
  kind: 'discover' | 'enrich' | 'import';
  trigger: string;
  params: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
  found: number;
  inserted: number;
  processed: number;
  errors: string[];
}

export interface EngineStats {
  newToday: number;
  queued: number;
  aiErrors: number;
  maxNewPerDay: number;
}

export interface InsertCandidatesResult {
  inserted: number;
  duplicates: number;
  /** Candidați neinserați pentru că s-a atins plafonul zilnic */
  overCap: number;
}

export interface DiscoverResult {
  runId: string;
  niche: string | null;
  city: string | null;
  found: number;
  inserted: number;
  duplicates: number;
  errors: string[];
  skipped?: string;
}

export interface EnrichResult {
  runId: string;
  processed: number;
  leads: Array<{ id: string; name: string; stage: string }>;
  errors: string[];
}
