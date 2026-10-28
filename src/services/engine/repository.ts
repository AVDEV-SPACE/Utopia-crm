import { sql } from '@/lib/neon';
import type { Lead, LeadStatus, PitchChannel } from '@/services/leads/types';
import { resolveStage, statusForStage } from '@/services/pipeline/stages';
import type { PipelineScoreDetails } from '@/services/pipeline/types';
import { businessEmailDomain, domainOf, isSocialUrl } from './normalize';
import type {
  EngineCandidate,
  EngineLeadSource,
  EngineRun,
  EngineSettings,
  EngineStats,
  InsertCandidatesResult,
} from './types';

/** Sursele din coada motorului (descoperite + importate din CSV). */
export const ENGINE_SOURCES: EngineLeadSource[] = ['engine', 'linkedin'];

/** Un lead AI_ERROR se reia de cel mult atâtea ori. */
export const MAX_AI_ATTEMPTS = 3;

const DEFAULT_MAX_NEW_PER_DAY = 150;

// ─── Setări ──────────────────────────────────────────────────────────────────

const MISSING_SCHEMA = 'Tabelele motorului lipsesc din baza de date — rulează setup-db-engine.sql în Neon';

export async function getEngineSettings(): Promise<EngineSettings> {
  let rows;
  try {
    rows = await sql`SELECT * FROM engine_settings WHERE id = 1`;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') throw new Error(MISSING_SCHEMA); // undefined_table
    throw error;
  }
  if (!rows[0]) throw new Error(MISSING_SCHEMA);
  return rows[0] as unknown as EngineSettings;
}

/** Plafonul zilnic efectiv: setarea din UI, altfel env, altfel 150. */
export function effectiveMaxNewPerDay(settings: EngineSettings): number {
  if (settings.max_new_per_day !== null) return settings.max_new_per_day;
  const fromEnv = Number(process.env.ENGINE_MAX_NEW_LEADS_PER_DAY);
  return Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : DEFAULT_MAX_NEW_PER_DAY;
}

export interface EngineSettingsPatch {
  niches?: string[];
  cities?: string[];
  max_new_per_day?: number | null;
  enrich_batch?: number;
  min_score?: number;
}

export async function updateEngineSettings(patch: EngineSettingsPatch): Promise<EngineSettings> {
  const current = await getEngineSettings();
  const next = { ...current, ...patch };
  // Lista de perechi s-a schimbat → rotația reîncepe, altfel cursorul vechi
  // ar sări peste perechi noi
  const listsChanged =
    JSON.stringify(next.niches) !== JSON.stringify(current.niches) ||
    JSON.stringify(next.cities) !== JSON.stringify(current.cities);

  const rows = await sql`
    UPDATE engine_settings SET
      niches          = ${next.niches}::text[],
      cities          = ${next.cities}::text[],
      max_new_per_day = ${next.max_new_per_day},
      enrich_batch    = ${next.enrich_batch},
      min_score       = ${next.min_score},
      cursor_pos      = ${listsChanged ? 0 : current.cursor_pos},
      updated_at      = now()
    WHERE id = 1
    RETURNING *
  `;
  return rows[0] as unknown as EngineSettings;
}

/**
 * Următoarea pereche nișă × oraș. Incrementul e atomic, deci două rulări
 * suprapuse primesc perechi diferite.
 */
export async function nextDiscoverPair(): Promise<{ niche: string; city: string } | null> {
  const rows = await sql`
    UPDATE engine_settings SET cursor_pos = cursor_pos + 1
    WHERE id = 1
    RETURNING cursor_pos - 1 AS pos, niches, cities
  `;
  const row = rows[0] as { pos: number; niches: string[]; cities: string[] } | undefined;
  if (!row || row.niches.length === 0 || row.cities.length === 0) return null;

  const index = row.pos % (row.niches.length * row.cities.length);
  return {
    niche: row.niches[index % row.niches.length],
    city: row.cities[Math.floor(index / row.niches.length) % row.cities.length],
  };
}

// ─── Rulări ──────────────────────────────────────────────────────────────────

export async function startRun(kind: EngineRun['kind'], trigger: string, params: Record<string, unknown> = {}): Promise<string> {
  const rows = await sql`
    INSERT INTO engine_runs (kind, trigger, params)
    VALUES (${kind}, ${trigger}, ${JSON.stringify(params)}::jsonb)
    RETURNING id
  `;
  return String(rows[0].id);
}

export async function finishRun(
  id: string,
  result: { found?: number; inserted?: number; processed?: number; errors?: string[]; params?: Record<string, unknown> }
): Promise<void> {
  await sql`
    UPDATE engine_runs SET
      finished_at = now(),
      found       = ${result.found ?? 0},
      inserted    = ${result.inserted ?? 0},
      processed   = ${result.processed ?? 0},
      errors      = ${JSON.stringify((result.errors ?? []).map((e) => e.slice(0, 500)))}::jsonb,
      params      = coalesce(params, '{}'::jsonb) || ${JSON.stringify(result.params ?? {})}::jsonb
    WHERE id = ${id}
  `;
}

export async function listRuns(limit = 10): Promise<EngineRun[]> {
  const rows = await sql`SELECT * FROM engine_runs ORDER BY started_at DESC, id DESC LIMIT ${limit}`;
  return rows.map((r) => ({ ...r, id: String(r.id) })) as unknown as EngineRun[];
}

/** Începutul zilei curente în Europe/Bucharest, ca timestamptz. */
const TODAY_START = `(date_trunc('day', now() AT TIME ZONE 'Europe/Bucharest') AT TIME ZONE 'Europe/Bucharest')`;

export async function countNewToday(): Promise<number> {
  const rows = await sql.query(
    `SELECT count(*)::int AS n FROM leads WHERE source = 'engine' AND created_at >= ${TODAY_START}`
  );
  return (rows[0] as { n: number }).n;
}

export async function getEngineStats(): Promise<EngineStats> {
  const [settings, rows] = await Promise.all([
    getEngineSettings(),
    sql.query(
      `SELECT
         count(*) FILTER (WHERE source = 'engine' AND created_at >= ${TODAY_START})::int AS new_today,
         count(*) FILTER (WHERE pipeline_stage = 'SOURCED'
                            OR (pipeline_stage = 'AI_ERROR' AND engine_attempts < $2))::int AS queued,
         count(*) FILTER (WHERE pipeline_stage = 'AI_ERROR')::int AS ai_errors
       FROM leads WHERE source = ANY($1::text[])`,
      [ENGINE_SOURCES, MAX_AI_ATTEMPTS]
    ),
  ]);
  const r = rows[0] as { new_today: number; queued: number; ai_errors: number };
  return { newToday: r.new_today, queued: r.queued, aiErrors: r.ai_errors, maxNewPerDay: effectiveMaxNewPerDay(settings) };
}

// ─── Candidați ───────────────────────────────────────────────────────────────

/**
 * Cheia unui candidat (`source_ref`): domeniul site-ului, altfel domeniul unui
 * email de firmă, altfel id-ul din sursă (osm:node/1, meta:123, places:abc, csv:...).
 */
function candidateKey(c: EngineCandidate): { key: string; domain: string | null } {
  const website = c.website && !isSocialUrl(c.website) ? c.website : null;
  const domain = domainOf(website) ?? businessEmailDomain(c.email);
  if (domain) return { key: domain, domain };

  const prefix: Record<string, string> = {
    openstreetmap: 'osm',
    overture: 'ovt',
    meta_ad_library: 'meta',
    google_places: 'places',
    csv: 'csv',
  };
  const id = c.discovery.externalId ?? `${c.name}|${c.city ?? ''}`.toLowerCase();
  return { key: `${prefix[c.discovery.source] ?? c.discovery.source}:${id}`, domain: null };
}

/**
 * Ultimele 9 cifre ale telefonului (07xx…, +40 7xx…, 0040… → aceeași cheie).
 * Firmele fără site n-au domeniu, deci se deduplică după telefon.
 */
function phoneKey(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/**
 * Inserează candidații ca lead-uri SOURCED, fără duplicate:
 * - în lot: același domeniu sau același telefon apare o singură dată
 *   (lanțuri cu mai multe locații, același loc mapat ca punct și ca clădire);
 * - față de DB: același `source_ref`, `domain` sau telefon pe ORICE lead
 *   (inclusiv importurile din sheet și clienții existenți) → sărit.
 * Un candidat din Meta Ad Library care se potrivește cu un lead existent încă
 * neprocesat îi marchează doar `hasActiveMetaAds` (îl face segment A).
 *
 * `limit` = câte lead-uri noi mai are voie rularea (plafonul zilnic).
 */
export async function insertCandidates(
  candidates: EngineCandidate[],
  options: { orgId: string; source: EngineLeadSource; limit: number }
): Promise<InsertCandidatesResult> {
  const unique = new Map<string, { candidate: EngineCandidate; domain: string | null; phone: string | null }>();
  const keyByPhone = new Map<string, string>();
  let duplicates = 0;

  for (const candidate of candidates) {
    const { key, domain } = candidateKey(candidate);
    const phone = phoneKey(candidate.phone);
    const previous = unique.get(key) ?? (phone && keyByPhone.has(phone) ? unique.get(keyByPhone.get(phone) as string) : undefined);
    if (previous) {
      duplicates++;
      // Aceeași firmă găsită în două surse: păstrăm informația de reclame active
      if (candidate.discovery.hasActiveMetaAds) previous.candidate.discovery = { ...previous.candidate.discovery, hasActiveMetaAds: true, metaPageId: candidate.discovery.metaPageId, facebook: previous.candidate.discovery.facebook ?? candidate.discovery.facebook };
      continue;
    }
    unique.set(key, { candidate, domain, phone });
    if (phone) keyByPhone.set(phone, key);
  }

  const keys = [...unique.keys()];
  const domains = [...unique.values()].map((u) => u.domain).filter((d): d is string => Boolean(d));
  const phones = [...keyByPhone.keys()];
  const existing = keys.length
    ? await sql`
        SELECT id, source_ref, domain, pipeline_stage,
               right(regexp_replace(coalesce(contact_phone, ''), '[^0-9]', '', 'g'), 9) AS phone_key
        FROM leads
        WHERE source_ref = ANY(${keys}::text[]) OR domain = ANY(${domains}::text[])
           OR (contact_phone IS NOT NULL
               AND right(regexp_replace(contact_phone, '[^0-9]', '', 'g'), 9) = ANY(${phones}::text[]))
      `
    : [];
  type ExistingLead = { id: string; pipeline_stage: string | null };
  const existingByKey = new Map<string, ExistingLead>();
  const existingByPhone = new Map<string, ExistingLead>();
  for (const row of existing) {
    if (row.source_ref) existingByKey.set(row.source_ref as string, row as ExistingLead);
    if (row.domain) existingByKey.set(row.domain as string, row as ExistingLead);
    if (row.phone_key && phones.includes(row.phone_key as string)) existingByPhone.set(row.phone_key as string, row as ExistingLead);
  }

  let inserted = 0;
  let overCap = 0;

  for (const [key, { candidate, domain, phone }] of unique) {
    const match =
      existingByKey.get(key) ??
      (domain ? existingByKey.get(domain) : undefined) ??
      (phone ? existingByPhone.get(phone) : undefined);
    if (match) {
      duplicates++;
      if (candidate.discovery.hasActiveMetaAds && match.pipeline_stage === 'SOURCED') {
        await sql`
          UPDATE leads SET score_details = coalesce(score_details, '{}'::jsonb)
            || jsonb_build_object('discovery', coalesce(score_details->'discovery', '{}'::jsonb)
               || ${JSON.stringify({ hasActiveMetaAds: true, metaPageId: candidate.discovery.metaPageId, facebook: candidate.discovery.facebook })}::jsonb)
          WHERE id = ${match.id}::uuid
        `;
      }
      continue;
    }
    if (inserted >= options.limit) {
      overCap++;
      continue;
    }

    const website = candidate.website && !isSocialUrl(candidate.website) ? candidate.website : null;
    const details: Partial<PipelineScoreDetails> = { source: candidate.discovery.source, discovery: candidate.discovery };
    const rows = await sql`
      INSERT INTO leads (
        org_id, source, source_ref, company_name, website, niche, category, location, address,
        contact_email, contact_phone, contact_instagram, score_details, status, pipeline_stage
      ) VALUES (
        ${options.orgId}, ${options.source}, ${key}, ${candidate.name.slice(0, 300)}, ${website},
        ${candidate.niche}, ${candidate.niche}, ${candidate.city}, ${candidate.address},
        ${candidate.email}, ${candidate.phone}, ${candidate.discovery.instagram},
        ${JSON.stringify(details)}::jsonb, 'new', 'SOURCED'
      )
      ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
      RETURNING id
    `;
    if (rows.length > 0) inserted++;
    else duplicates++;
  }

  return { inserted, duplicates, overCap };
}

// ─── Coada de îmbogățire ─────────────────────────────────────────────────────

/**
 * Rezervă atomic următoarele lead-uri de procesat: SOURCED întâi, apoi
 * AI_ERROR cu încercări rămase. O rezervare expiră după 10 minute (rulare
 * căzută), deci un lead nu rămâne blocat.
 */
export async function claimQueue(limit: number): Promise<Lead[]> {
  const rows = await sql`
    UPDATE leads SET engine_claimed_at = now()
    WHERE id IN (
      SELECT id FROM leads
      WHERE source = ANY(${ENGINE_SOURCES}::text[])
        AND (pipeline_stage = 'SOURCED' OR (pipeline_stage = 'AI_ERROR' AND engine_attempts < ${MAX_AI_ATTEMPTS}))
        AND (engine_claimed_at IS NULL OR engine_claimed_at < now() - interval '10 minutes')
      ORDER BY (pipeline_stage = 'SOURCED') DESC, created_at ASC, id ASC
      LIMIT ${limit}
    )
    RETURNING *
  `;
  return rows as unknown as Lead[];
}

/** Eliberează rezervarea (rulare oprită înainte să ajungă la lead). */
export async function releaseClaims(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`UPDATE leads SET engine_claimed_at = NULL WHERE id = ANY(${ids}::uuid[])`;
}

export interface EnrichmentUpdate {
  stage: string;
  email: string | null;
  instagram: string | null;
  score: number | null;
  pitchSubject: string | null;
  pitchBody: string | null;
  details: PipelineScoreDetails;
  segment: 'A' | 'B';
  icpMatch: boolean;
  /** true = încercarea de AI a eșuat (incrementăm engine_attempts) */
  aiFailed: boolean;
}

/**
 * Salvează rezultatul îmbogățirii. Etapa trece prin `resolveStage`, iar
 * scrierea e condiționată de etapa citită: dacă între timp lead-ul a avansat
 * (ex. setat manual), nu îl suprascriem.
 */
export async function saveEnrichment(lead: Lead, update: EnrichmentUpdate): Promise<string | null> {
  const stage = resolveStage(lead.pipeline_stage, update.stage);
  const status: LeadStatus = stage !== lead.pipeline_stage ? statusForStage(stage) : lead.status;
  const email = lead.contact_email ?? update.email;
  const instagram = lead.contact_instagram ?? update.instagram;
  const channel: PitchChannel = email ? 'email' : instagram ? 'instagram' : 'whatsapp';

  const rows = await sql`
    UPDATE leads SET
      contact_email     = ${email},
      contact_instagram = ${instagram},
      score             = coalesce(${update.score}, score),
      pitch_subject     = coalesce(${update.pitchSubject}, pitch_subject),
      pitch_generated   = coalesce(${update.pitchBody}, pitch_generated),
      pitch_channel     = ${channel},
      score_details     = ${JSON.stringify(update.details)}::jsonb,
      segment           = ${update.segment},
      icp_match         = ${update.icpMatch},
      pipeline_stage    = ${stage},
      status            = ${status},
      engine_attempts   = engine_attempts + ${update.aiFailed ? 1 : 0},
      engine_claimed_at = NULL,
      updated_at        = now()
    WHERE id = ${lead.id}::uuid
      AND pipeline_stage IS NOT DISTINCT FROM ${lead.pipeline_stage}
    RETURNING id
  `;
  return rows.length > 0 ? stage : null;
}
