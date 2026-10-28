import { sql } from '@/lib/neon';
import type { Lead, LeadStatus, PitchChannel } from '@/services/leads/types';
import { blocksOutreach, resolveStage, statusForStage, TERMINAL_STAGES } from './stages';
import type {
  PipelineEvent,
  PipelineEventInput,
  PipelineEventResult,
  PipelineFacets,
  PipelineFilters,
  PipelineKpi,
  PipelineLeadInput,
  PipelineLeadRow,
  PipelinePage,
  PipelineScoreDetails,
  PipelineUpsertResult,
} from './types';

/** Sursa cu care intră în `leads` tot ce trece prin pipeline (motorul de leaduri și importurile). */
export const PIPELINE_SOURCE = 'engine';

/** Sursele afișate în /pipeline: motorul + importurile CSV (export LinkedIn etc.). */
export const PIPELINE_SOURCES = [PIPELINE_SOURCE, 'linkedin'];

/**
 * De câte ori reîncercăm o scriere pierdută în fața unei alte scrieri
 * concurente pe același lead (vezi `upsertPipelineLead`).
 */
const MAX_ATTEMPTS = 3;

async function getLeadBySourceRef(sourceRef: string): Promise<Lead | null> {
  const rows = await sql`SELECT * FROM leads WHERE source_ref = ${sourceRef} LIMIT 1`;
  return (rows[0] as unknown as Lead) ?? null;
}

/** Canalul pitch-ului: email dacă avem adresă, altfel Instagram, altfel WhatsApp. */
function channelFor(email: string | null, instagram: string | null): PitchChannel {
  if (email) return 'email';
  if (instagram) return 'instagram';
  return 'whatsapp';
}

/** Scorul ICP intră în `leads.score`, care are CHECK 0–100. */
function clampScore(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  return Math.min(Math.max(Math.round(score), 0), 100);
}

function buildScoreDetails(input: PipelineLeadInput): PipelineScoreDetails {
  return {
    reason: input.ai?.score_reason ?? null,
    segment: input.segment,
    icpMatch: input.signals?.icpMatch ?? null,
    signals: input.signals,
    audit: input.audit,
    social: input.social,
    linkedinDm: input.ai?.linkedin_dm ?? null,
    instagramDm: input.ai?.instagram_dm ?? null,
    emailSource: input.emailSource,
    source: input.source,
  };
}

/** `score_details` al unui lead din pipeline existent, sau `null` dacă are altă formă. */
function existingDetails(lead: Lead): Partial<PipelineScoreDetails> | null {
  const details = lead.score_details as unknown;
  return details && typeof details === 'object' ? (details as Partial<PipelineScoreDetails>) : null;
}

/**
 * Upsert idempotent după `key` (→ `source_ref`).
 *
 * Reguli:
 * - etapa nu coboară niciodată (`resolveStage`); finalele rămân finale;
 * - după contact (`blocksOutreach` pe etapa anterioară) pitch-ul, subiectul,
 *   DM-urile și canalul rămân cele trimise efectiv;
 * - emailul existent nu se suprascrie; `org_id`, `notes`, `payment_link` nu
 *   se ating la update;
 * - `status` se recalculează din etapă doar când etapa se schimbă, ca o
 *   corecție manuală făcută în /leads să nu fie ștearsă la fiecare sincronizare.
 *
 * Scrierea pe un lead existent e condiționată de etapa citită (optimistic
 * locking): dacă între citire și scriere un eveniment a mutat etapa, update-ul
 * nu atinge niciun rând și reîncercăm cu starea nouă — altfel un upsert
 * întârziat ar putea readuce lead-ul la o etapă mai mică.
 */
export async function upsertPipelineLead(
  input: PipelineLeadInput,
  orgId: string
): Promise<PipelineUpsertResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await getLeadBySourceRef(input.key);
    const result = existing ? await updateFromPipeline(existing, input) : await insertFromPipeline(input, orgId);
    if (result) return result;
  }
  throw new Error(`Upsert pipeline eșuat după ${MAX_ATTEMPTS} încercări (scrieri concurente pe ${input.key})`);
}

async function insertFromPipeline(
  input: PipelineLeadInput,
  orgId: string
): Promise<PipelineUpsertResult | null> {
  const stage = resolveStage(null, input.stage);
  const instagram = input.social?.instagram ?? null;

  const rows = await sql`
    INSERT INTO leads (
      org_id, source, source_ref, company_name, website, niche, category, location, address,
      score, score_details, contact_email, contact_instagram, contact_phone,
      pitch_subject, pitch_generated, pitch_channel, status,
      pipeline_stage, segment, icp_match
    ) VALUES (
      ${orgId}, ${PIPELINE_SOURCE}, ${input.key}, ${input.name}, ${input.website}, ${input.niche},
      ${input.niche}, ${input.city}, ${input.address},
      ${clampScore(input.icpScore)}, ${JSON.stringify(buildScoreDetails(input))}::jsonb,
      ${input.email}, ${instagram}, ${input.phone},
      ${input.ai?.subject ?? null}, ${input.ai?.email_body ?? null},
      ${channelFor(input.email, instagram)}, ${statusForStage(stage)},
      ${stage}, ${input.segment}, ${input.signals?.icpMatch ?? null}
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
    RETURNING id
  `;

  // Niciun rând: alt request a inserat același key între timp → reîncercăm pe update
  if (rows.length === 0) return null;
  return { id: rows[0].id as string, key: input.key, stage, created: true, skipOutreach: false };
}

async function updateFromPipeline(
  existing: Lead,
  input: PipelineLeadInput
): Promise<PipelineUpsertResult | null> {
  const previousStage = existing.pipeline_stage;
  const locked = blocksOutreach(previousStage);
  const stage = resolveStage(previousStage, input.stage);
  const status: LeadStatus = stage !== previousStage ? statusForStage(stage) : existing.status;

  const incomingInstagram = input.social?.instagram ?? null;
  const email = existing.contact_email ?? input.email;
  const instagram = locked
    ? existing.contact_instagram ?? incomingInstagram
    : incomingInstagram ?? existing.contact_instagram;

  // DM-urile fac parte din pitch: după contact rămân cele deja folosite
  const details = buildScoreDetails(input);
  const old = existingDetails(existing);
  if (locked && old) {
    details.linkedinDm = old.linkedinDm ?? details.linkedinDm;
    details.instagramDm = old.instagramDm ?? details.instagramDm;
  }

  const pitchSubject = locked ? existing.pitch_subject : input.ai?.subject ?? existing.pitch_subject;
  const pitchBody = locked ? existing.pitch_generated : input.ai?.email_body ?? existing.pitch_generated;
  const pitchChannel = locked ? existing.pitch_channel : channelFor(email, instagram);

  const rows = await sql`
    UPDATE leads SET
      company_name      = ${input.name},
      website           = ${input.website ?? existing.website},
      niche             = ${input.niche ?? existing.niche},
      category          = ${input.niche ?? existing.category},
      location          = ${input.city ?? existing.location},
      address           = ${input.address ?? existing.address},
      score             = ${clampScore(input.icpScore) ?? existing.score},
      score_details     = ${JSON.stringify(details)}::jsonb,
      contact_email     = ${email},
      contact_instagram = ${instagram},
      contact_phone     = ${input.phone ?? existing.contact_phone},
      pitch_subject     = ${pitchSubject},
      pitch_generated   = ${pitchBody},
      pitch_channel     = ${pitchChannel},
      status            = ${status},
      pipeline_stage    = ${stage},
      segment           = ${input.segment ?? existing.segment},
      icp_match         = ${input.signals?.icpMatch ?? existing.icp_match},
      updated_at        = now()
    WHERE id = ${existing.id}::uuid
      AND pipeline_stage IS NOT DISTINCT FROM ${previousStage}
    RETURNING id
  `;

  if (rows.length === 0) return null;
  return { id: existing.id, key: input.key, stage, created: false, skipOutreach: locked };
}

/** Lead-ul unui eveniment: întâi după `key`, apoi după email (pipeline-ul înaintea altor surse). */
async function findLeadForEvent(key: string | null, email: string | null): Promise<Lead | null> {
  if (key) {
    const lead = await getLeadBySourceRef(key);
    if (lead) return lead;
  }
  if (email) {
    const rows = await sql`
      SELECT * FROM leads
      WHERE lower(contact_email) = lower(${email})
      ORDER BY (source = ANY(${PIPELINE_SOURCES}::text[])) DESC, created_at DESC
      LIMIT 1
    `;
    return (rows[0] as unknown as Lead) ?? null;
  }
  return null;
}

/**
 * Mută etapa unui lead (fără să coboare) și actualizează `last_event_at`.
 * Întoarce etapa rezultată, sau `null` dacă etapa s-a schimbat concurent și
 * trebuie reîncercat.
 */
async function advanceLead(lead: Lead, incoming: string | null, at: Date): Promise<string | null> {
  const previousStage = lead.pipeline_stage;
  // Fără etapă în eveniment nu atingem nici etapa, nici statusul: un lead din
  // alte surse (potrivit după email) nu trebuie să primească o etapă implicită.
  const stage = incoming ? resolveStage(previousStage, incoming) : previousStage;
  const status: LeadStatus = stage !== previousStage ? statusForStage(stage) : lead.status;

  const rows = await sql`
    UPDATE leads SET
      pipeline_stage = ${stage},
      status         = ${status},
      last_event_at  = GREATEST(coalesce(last_event_at, ${at.toISOString()}::timestamptz), ${at.toISOString()}::timestamptz),
      updated_at     = now()
    WHERE id = ${lead.id}::uuid
      AND pipeline_stage IS NOT DISTINCT FROM ${previousStage}
    RETURNING id
  `;
  return rows.length > 0 ? stage ?? '' : null;
}

async function insertEvent(leadId: string | null, input: PipelineEventInput, at: Date): Promise<void> {
  await sql`
    INSERT INTO pipeline_events (
      lead_id, source_ref, email, channel, event, stage, campaign_id, reply_text, payload, occurred_at
    ) VALUES (
      ${leadId}, ${input.key}, ${input.email}, ${input.channel}, ${input.event}, ${input.stage},
      ${input.campaignId}, ${input.replyText},
      ${input.payload === undefined ? null : JSON.stringify(input.payload)}::jsonb,
      ${at.toISOString()}::timestamptz
    )
  `;
}

/**
 * Jurnalizează un eveniment de outreach și avansează etapa lead-ului potrivit.
 * Un eveniment nepotrivit se păstrează oricum (cu `lead_id` NULL), pentru audit.
 * `leadId` sare peste potrivire, când apelantul (outreach) știe deja lead-ul.
 */
export async function logPipelineEvent(input: PipelineEventInput, leadId?: string): Promise<PipelineEventResult> {
  const at = input.occurredAt ?? new Date();

  let lead = leadId ? await getLeadById(leadId) : await findLeadForEvent(input.key, input.email);
  let previousStage: string | null = null;
  let stage: string | null = null;

  for (let attempt = 0; lead && attempt < MAX_ATTEMPTS; attempt++) {
    previousStage = lead.pipeline_stage;
    const result = await advanceLead(lead, input.stage, at);
    if (result !== null) {
      stage = result || null;
      break;
    }
    lead = await getLeadById(lead.id);
    if (attempt === MAX_ATTEMPTS - 1) throw new Error('Eveniment pipeline: scrieri concurente repetate');
  }

  await insertEvent(lead?.id ?? null, input, at);
  return { matched: Boolean(lead), leadId: lead?.id ?? null, previousStage, stage };
}

async function getLeadById(id: string): Promise<Lead | null> {
  const rows = await sql`SELECT * FROM leads WHERE id = ${id}::uuid`;
  return (rows[0] as unknown as Lead) ?? null;
}

export type ManualStageResult =
  | { ok: true; lead: Lead; previousStage: string | null }
  | { ok: false; reason: 'not_found' | 'downgrade' };

/**
 * Etapă setată manual din /pipeline. Respectă `resolveStage` (nu coboară), cu
 * o excepție: WON / LOST / DO_NOT_CONTACT se pot seta explicit oricând — sunt
 * decizii ale omului, inclusiv corectarea unei finale greșite.
 */
export async function setManualStage(
  id: string,
  stage: string,
  author: { id: string | null; name: string | null }
): Promise<ManualStageResult> {
  const lead = await getLeadById(id);
  if (!lead) return { ok: false, reason: 'not_found' };

  const previousStage = lead.pipeline_stage;
  const next = TERMINAL_STAGES.has(stage) ? stage : resolveStage(previousStage, stage);
  if (next !== stage) return { ok: false, reason: 'downgrade' };

  const status: LeadStatus = next !== previousStage ? statusForStage(next) : lead.status;
  const rows = await sql`
    UPDATE leads SET pipeline_stage = ${next}, status = ${status}, last_event_at = now(), updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  const updated = rows[0] as unknown as Lead | undefined;
  if (!updated) return { ok: false, reason: 'not_found' };

  await insertEvent(id, {
    key: lead.source_ref,
    email: lead.contact_email,
    channel: 'manual',
    event: 'stage_changed',
    stage: next,
    campaignId: null,
    replyText: null,
    occurredAt: null,
    payload: { from: previousStage, to: next, authorId: author.id, authorName: author.name },
  }, new Date());

  return { ok: true, lead: updated, previousStage };
}

/** Lista din /pipeline: filtre + paginare + KPI + fațete, în paralel. */
export async function listPipelineLeads(filters: PipelineFilters = {}): Promise<PipelinePage> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const params: unknown[] = [PIPELINE_SOURCES];
  const push = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  const where: string[] = ['source = ANY($1::text[])'];

  if (filters.stage) where.push(`pipeline_stage = ${push(filters.stage)}`);
  if (filters.segment) where.push(`segment = ${push(filters.segment)}`);
  if (typeof filters.icp === 'boolean') where.push(`icp_match IS ${filters.icp ? 'TRUE' : 'NOT TRUE'}`);
  if (filters.city) where.push(`location = ${push(filters.city)}`);

  const term = filters.q?.trim();
  if (term) {
    const like = push(`%${term}%`);
    where.push(
      `(company_name ILIKE ${like}
        OR location ILIKE ${like}
        OR niche ILIKE ${like}
        OR contact_email ILIKE ${like}
        OR website ILIKE ${like}
        OR source_ref ILIKE ${like})`
    );
  }

  // `id` la final: departajează rândurile cu același scor / aceeași dată, ca
  // paginile consecutive să nu repete sau sară lead-uri.
  const orderSql =
    filters.sort === 'score'
      ? 'ORDER BY score DESC NULLS LAST, created_at DESC, id DESC'
      : 'ORDER BY created_at DESC, id DESC';

  const [rows, kpiRows, facetRows] = await Promise.all([
    sql.query(
      `SELECT id, company_name, niche, location, website, score, status,
              contact_email, contact_phone, contact_instagram, source_ref,
              pipeline_stage, segment, icp_match, last_event_at, created_at, updated_at,
              count(*) OVER () AS total_count
       FROM leads
       WHERE ${where.join(' AND ')}
       ${orderSql}
       LIMIT ${push(limit)} OFFSET ${push(offset)}`,
      params
    ),
    sql`
      SELECT
        count(*)::int                                                          AS total,
        count(*) FILTER (WHERE icp_match)::int                                 AS icp_match,
        count(*) FILTER (WHERE segment = 'A')::int                             AS segment_a,
        count(*) FILTER (WHERE pipeline_stage = 'QUEUED_EMAIL')::int           AS queued_email,
        count(*) FILTER (WHERE pipeline_stage IN ('REPLIED', 'INTERESTED'))::int AS replied,
        count(*) FILTER (WHERE pipeline_stage = 'CALL_BOOKED')::int            AS call_booked,
        count(*) FILTER (WHERE pipeline_stage = 'WON')::int                    AS won
      FROM leads
      WHERE source = ANY(${PIPELINE_SOURCES}::text[])
    `,
    sql`
      SELECT
        array_remove(array_agg(DISTINCT location), NULL)       AS cities,
        array_remove(array_agg(DISTINCT segment), NULL)        AS segments,
        array_remove(array_agg(DISTINCT pipeline_stage), NULL) AS stages
      FROM leads
      WHERE source = ANY(${PIPELINE_SOURCES}::text[])
    `,
  ]);

  const list = rows as unknown as Array<PipelineLeadRow & { total_count: string }>;
  const k = kpiRows[0] ?? {};
  const f = facetRows[0] ?? {};
  const sorted = (values: unknown): string[] =>
    Array.isArray(values) ? (values as string[]).slice().sort((a, b) => a.localeCompare(b, 'ro')) : [];

  const kpi: PipelineKpi = {
    total: k.total ?? 0,
    icpMatch: k.icp_match ?? 0,
    segmentA: k.segment_a ?? 0,
    queuedEmail: k.queued_email ?? 0,
    replied: k.replied ?? 0,
    callBooked: k.call_booked ?? 0,
    won: k.won ?? 0,
  };
  const facets: PipelineFacets = {
    cities: sorted(f.cities),
    segments: sorted(f.segments),
    stages: sorted(f.stages),
  };

  return {
    rows: list.map(({ total_count: _total, ...lead }) => lead),
    total: list.length > 0 ? Number(list[0].total_count) : 0,
    kpi,
    facets,
  };
}

/** Fișa unui lead din pipeline, cu istoricul evenimentelor (cele mai noi întâi). */
export async function getPipelineLead(id: string): Promise<{ lead: Lead; events: PipelineEvent[] } | null> {
  const lead = await getLeadById(id);
  if (!lead) return null;

  const events = await sql`
    SELECT * FROM pipeline_events
    WHERE lead_id = ${id}::uuid
    ORDER BY occurred_at DESC, id DESC
    LIMIT 200
  `;
  return { lead, events: events as unknown as PipelineEvent[] };
}
