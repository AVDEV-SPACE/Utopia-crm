import { sql } from '@/lib/neon';
import { PIPELINE_SOURCES } from '@/services/pipeline/repository';
import { STEP_OFFSET_DAYS, TODAY_START_SQL } from './schedule';
import type { OutreachChannel, OutreachTask } from './types';

/** Etapele din care un lead intră în secvență. */
export const PLANNABLE_STAGES = ['QUEUED_EMAIL', 'QUEUED_MANUAL'];

/** După cât timp o revendicare de trimitere (rulare căzută) expiră. */
const CLAIM_TTL_MINUTES = 10;

/** Lead-ul unui candidat la planificare, cu ce trebuie pentru alegerea canalului. */
export interface PlanCandidate {
  id: string;
  company_name: string;
  niche: string | null;
  location: string | null;
  contact_email: string | null;
  contact_instagram: string | null;
  linkedin: string | null;
  pitch_subject: string | null;
  pitch_generated: string | null;
  instagram_dm: string | null;
  linkedin_dm: string | null;
}

/**
 * Leaduri din motor / import, cu ICP, în coadă și fără niciun pas creat.
 * Cele mai bune scoruri întâi.
 */
export async function listPlanCandidates(limit: number): Promise<PlanCandidate[]> {
  const rows = await sql`
    SELECT l.id::text, l.company_name, l.niche, l.location, l.contact_email, l.contact_instagram,
           l.score_details->'social'->>'linkedin' AS linkedin,
           l.pitch_subject, l.pitch_generated,
           l.score_details->>'instagramDm' AS instagram_dm,
           l.score_details->>'linkedinDm' AS linkedin_dm
    FROM leads l
    WHERE l.source = ANY(${PIPELINE_SOURCES}::text[])
      AND l.pipeline_stage = ANY(${PLANNABLE_STAGES}::text[])
      AND l.icp_match = true
      AND NOT EXISTS (SELECT 1 FROM outreach_tasks t WHERE t.lead_id = l.id)
    ORDER BY l.score DESC NULLS LAST, l.created_at
    LIMIT ${limit}
  `;
  return rows as unknown as PlanCandidate[];
}

/** Câte secvențe noi (pasul 1) s-au planificat azi pe fiecare canal. */
export async function countPlannedToday(): Promise<Record<OutreachChannel, number>> {
  const rows = (await sql.query(
    `SELECT channel, count(*)::int AS n FROM outreach_tasks
     WHERE step = 1 AND created_at >= ${TODAY_START_SQL}
     GROUP BY channel`
  )) as { channel: OutreachChannel; n: number }[];
  const counts: Record<OutreachChannel, number> = { email: 0, instagram: 0, linkedin: 0 };
  for (const row of rows) counts[row.channel] = row.n;
  return counts;
}

export interface NewStep {
  step: number;
  /** Template-ul pasului (randat la trimitere) sau `null` = textul AI din `message` */
  templateId: number | null;
  subject: string | null;
  message: string | null;
  dueAt: Date;
}

/**
 * Creează pașii unei secvențe, toți sau niciunul (tranzacție). Indexul unic
 * (lead, canal, pas) face rularea repetată inofensivă.
 */
export async function insertSequence(leadId: string, channel: OutreachChannel, steps: NewStep[]): Promise<number> {
  const results = await sql.transaction(
    steps.map(
      (s) => sql`
        INSERT INTO outreach_tasks (lead_id, channel, step, template_id, subject, message, due_at)
        VALUES (${leadId}::uuid, ${channel}, ${s.step}, ${s.templateId}, ${s.subject}, ${s.message},
                ${s.dueAt.toISOString()}::timestamptz)
        ON CONFLICT (lead_id, channel, step) DO NOTHING
        RETURNING id
      `
    )
  );
  return results.reduce((n, rows) => n + rows.length, 0);
}

/** Trimiterile de azi pe un canal (pentru plafon). */
export async function countSentToday(channel: OutreachChannel): Promise<number> {
  const rows = await sql.query(
    `SELECT count(*)::int AS n FROM outreach_tasks
     WHERE channel = $1 AND status = 'sent' AND sent_at >= ${TODAY_START_SQL}`,
    [channel]
  );
  return (rows[0] as { n: number }).n;
}

/** Un pas de email revendicat pentru trimitere, cu lead-ul și firul anterior. */
export interface ClaimedEmailTask extends OutreachTask {
  org_id: string | null;
  company_name: string;
  location: string | null;
  niche: string | null;
  contact_email: string | null;
  pipeline_stage: string | null;
  source_ref: string | null;
  /** Message-ID-urile pașilor deja trimiși, în ordine (pentru In-Reply-To / References) */
  thread_ids: string[] | null;
  /** Subiectul cu care a plecat pasul 1 (follow-up-urile răspund în același fir) */
  first_subject: string | null;
}

/**
 * Revendică atomic până la `limit` pași de email ajunși la termen. Un pas N>1
 * pleacă doar după ce pasul N-1 a fost trimis. Revendicarea e un singur
 * UPDATE, deci două rulări suprapuse nu iau același pas.
 *
 * `onlyTo` (lista de test): doar pașii către aceste adrese — ceilalți rămân
 * neatinși, fără să blocheze coada.
 */
export async function claimDueEmailTasks(limit: number, onlyTo: string[] = []): Promise<ClaimedEmailTask[]> {
  const rows = await sql`
    WITH due AS (
      SELECT t.id FROM outreach_tasks t
      JOIN leads l ON l.id = t.lead_id
      WHERE t.channel = 'email' AND t.status = 'pending' AND t.due_at <= now()
        AND (cardinality(${onlyTo}::text[]) = 0 OR lower(l.contact_email) = ANY(${onlyTo}::text[]))
        AND (t.claimed_at IS NULL OR t.claimed_at < now() - make_interval(mins => ${CLAIM_TTL_MINUTES}))
        AND (t.step = 1 OR EXISTS (
          SELECT 1 FROM outreach_tasks p
          WHERE p.lead_id = t.lead_id AND p.channel = t.channel AND p.step = t.step - 1 AND p.status = 'sent'
        ))
      ORDER BY t.due_at, t.step
      LIMIT ${limit}
      FOR UPDATE OF t SKIP LOCKED
    )
    UPDATE outreach_tasks t SET claimed_at = now(), updated_at = now()
    FROM due WHERE t.id = due.id
    RETURNING t.*
  `;
  const tasks = rows as unknown as OutreachTask[];
  if (tasks.length === 0) return [];

  const details = await sql`
    SELECT l.id::text AS lead_id, l.org_id, l.company_name, l.location, l.niche, l.contact_email,
      l.pipeline_stage, l.source_ref,
      (SELECT array_agg(p.message_id ORDER BY p.step) FROM outreach_tasks p
        WHERE p.lead_id = l.id AND p.channel = 'email' AND p.status IN ('sent', 'replied')
          AND p.message_id IS NOT NULL) AS thread_ids,
      (SELECT p.subject FROM outreach_tasks p
        WHERE p.lead_id = l.id AND p.channel = 'email' AND p.step = 1 AND p.sent_at IS NOT NULL) AS first_subject
    FROM leads l WHERE l.id = ANY(${tasks.map((t) => t.lead_id)}::uuid[])
  `;
  const byLead = new Map(details.map((d) => [d.lead_id as string, d]));
  return tasks.map((t) => ({ ...t, ...(byLead.get(t.lead_id) as Omit<ClaimedEmailTask, keyof OutreachTask>) }));
}

/**
 * Pas trimis. Pașii următori se recalculează de la momentul trimiterii reale:
 * dacă pasul 1 a stat în coadă din cauza plafonului, follow-up-urile nu vin
 * mai devreme decât intervalele secvenței.
 */
export async function markTaskSent(task: OutreachTask, messageId: string | null, sentAt: Date, subject: string): Promise<void> {
  const base = STEP_OFFSET_DAYS[task.step] ?? 0;
  await sql.transaction([
    sql`
      UPDATE outreach_tasks
      SET status = 'sent', sent_at = ${sentAt.toISOString()}::timestamptz, message_id = ${messageId},
          subject = ${subject}, error = NULL, claimed_at = NULL, updated_at = now()
      WHERE id = ${task.id}::uuid
    `,
    sql`
      UPDATE outreach_tasks
      SET due_at = ${sentAt.toISOString()}::timestamptz + make_interval(days => (
            CASE step WHEN 2 THEN ${STEP_OFFSET_DAYS[2]}::int WHEN 3 THEN ${STEP_OFFSET_DAYS[3]}::int ELSE 0 END
          ) - ${base}::int),
          updated_at = now()
      WHERE lead_id = ${task.lead_id}::uuid AND channel = ${task.channel}
        AND step > ${task.step} AND status = 'pending'
    `,
  ]);
}

export async function markTaskFailed(taskId: string, error: string): Promise<void> {
  await sql`
    UPDATE outreach_tasks SET status = 'failed', error = ${error.slice(0, 1000)}, claimed_at = NULL, updated_at = now()
    WHERE id = ${taskId}::uuid
  `;
}

/**
 * Oprește secvența unui lead: pașii pending devin `cancelled`. La un răspuns,
 * ultimul pas trimis devine `replied` (pasul la care a răspuns).
 */
export async function stopSequence(leadId: string, reason: 'replied' | 'cancelled'): Promise<number> {
  const [cancelled] = await sql.transaction([
    sql`
      UPDATE outreach_tasks SET status = 'cancelled', claimed_at = NULL, updated_at = now()
      WHERE lead_id = ${leadId}::uuid AND status = 'pending'
      RETURNING id
    `,
    ...(reason === 'replied'
      ? [
          sql`
            UPDATE outreach_tasks SET status = 'replied', updated_at = now()
            WHERE id = (
              SELECT id FROM outreach_tasks
              WHERE lead_id = ${leadId}::uuid AND status = 'sent'
              ORDER BY sent_at DESC NULLS LAST LIMIT 1
            )
          `,
        ]
      : []),
  ]);
  return cancelled.length;
}

/** Răspuns automat (concediu): secvența nu se oprește, doar se amână. */
export async function postponeSequence(leadId: string, days: number): Promise<number> {
  const rows = await sql`
    UPDATE outreach_tasks
    SET due_at = greatest(due_at, now()) + make_interval(days => ${days}), updated_at = now()
    WHERE lead_id = ${leadId}::uuid AND status = 'pending'
    RETURNING id
  `;
  return rows.length;
}

export async function findTaskByToken(token: string): Promise<OutreachTask | null> {
  const rows = await sql`SELECT * FROM outreach_tasks WHERE tracking_token = ${token} LIMIT 1`;
  return (rows[0] as unknown as OutreachTask) ?? null;
}

/** Prima deschidere a unui pas; `false` dacă a mai fost deschis. */
export async function markOpened(taskId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE outreach_tasks SET opened_at = now(), updated_at = now()
    WHERE id = ${taskId}::uuid AND opened_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}


// ── Răspunsuri (detectate de syncEmailReplies în sent_messages) ────────────

/** Un răspuns la un pas de outreach, încă neprocesat. */
export interface UnhandledReply {
  task_id: string;
  lead_id: string;
  step: number;
  pipeline_stage: string | null;
  status: string | null;
  source_ref: string | null;
  contact_email: string | null;
  reply_subject: string | null;
  reply_snippet: string | null;
  replied_at: string;
}

/**
 * Pașii trimiși la care `sent_messages` a înregistrat un răspuns, dar pe care
 * outreach-ul nu i-a procesat încă. Legătura e Message-ID-ul emailului.
 */
export async function listUnhandledReplies(limit: number): Promise<UnhandledReply[]> {
  const rows = await sql`
    SELECT t.id::text AS task_id, t.lead_id::text, t.step, l.pipeline_stage, l.status::text AS status,
           l.source_ref, l.contact_email, s.reply_subject, s.reply_snippet, s.replied_at
    FROM outreach_tasks t
    JOIN sent_messages s ON s.message_id = t.message_id
    JOIN leads l ON l.id = t.lead_id
    WHERE t.channel = 'email' AND t.message_id IS NOT NULL
      AND t.reply_handled_at IS NULL AND s.replied_at IS NOT NULL
    ORDER BY s.replied_at
    LIMIT ${limit}
  `;
  return rows as unknown as UnhandledReply[];
}

export async function markReplyHandled(taskId: string, intent: string | null): Promise<void> {
  await sql`
    UPDATE outreach_tasks SET reply_handled_at = now(), reply_intent = ${intent}, updated_at = now()
    WHERE id = ${taskId}::uuid
  `;
}

/** `syncEmailReplies` urcă lead-ul pe `replied`; la un răspuns automat îi readucem statusul etapei. */
export async function restoreLeadStatus(leadId: string, status: string): Promise<void> {
  await sql`
    UPDATE leads SET status = ${status}, updated_at = now()
    WHERE id = ${leadId}::uuid AND status = 'replied'
  `;
}

// ── Panoul din /pipeline ───────────────────────────────────────────────────

export interface OutreachStats {
  pending: number;
  dueNow: number;
  sentToday: number;
  sentTotal: number;
  replied: number;
  failed: number;
}

export async function getOutreachStats(): Promise<OutreachStats> {
  const rows = await sql.query(
    `SELECT
       count(*) FILTER (WHERE status = 'pending')::int AS pending,
       count(*) FILTER (WHERE status = 'pending' AND due_at <= now())::int AS due_now,
       count(*) FILTER (WHERE status IN ('sent', 'replied') AND sent_at >= ${TODAY_START_SQL})::int AS sent_today,
       count(*) FILTER (WHERE status IN ('sent', 'replied'))::int AS sent_total,
       count(*) FILTER (WHERE status = 'replied')::int AS replied,
       count(*) FILTER (WHERE status = 'failed')::int AS failed
     FROM outreach_tasks WHERE channel = 'email'`
  );
  const r = rows[0] as { pending: number; due_now: number; sent_today: number; sent_total: number; replied: number; failed: number };
  return { pending: r.pending, dueNow: r.due_now, sentToday: r.sent_today, sentTotal: r.sent_total, replied: r.replied, failed: r.failed };
}

/** Un lead pe care se poate vedea preview-ul (cu pitch-ul lui AI, dacă există). */
export interface PreviewLead {
  id: string;
  company_name: string;
  location: string | null;
  niche: string | null;
  contact_email: string | null;
  pitch_subject: string | null;
  pitch_generated: string | null;
}

/** Leadurile care urmează să primească emailuri (sau au primit), cele mai bune întâi. */
export async function listPreviewLeads(limit: number): Promise<PreviewLead[]> {
  const rows = await sql`
    SELECT l.id::text, l.company_name, l.location, l.niche, l.contact_email, l.pitch_subject, l.pitch_generated
    FROM leads l
    WHERE l.source = ANY(${PIPELINE_SOURCES}::text[]) AND l.contact_email IS NOT NULL
      AND (l.pipeline_stage = 'QUEUED_EMAIL'
           OR EXISTS (SELECT 1 FROM outreach_tasks t WHERE t.lead_id = l.id AND t.channel = 'email'))
    ORDER BY l.score DESC NULLS LAST, l.created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as PreviewLead[];
}

export async function getPreviewLead(id: string): Promise<PreviewLead | null> {
  const rows = await sql`
    SELECT id::text, company_name, location, niche, contact_email, pitch_subject, pitch_generated
    FROM leads WHERE id = ${id}::uuid
  `;
  return (rows[0] as unknown as PreviewLead) ?? null;
}

/** Textul AI deja planificat pentru un pas (follow-up-urile 2–3 se generează la planificare). */
export async function getPlannedStep(leadId: string, step: number): Promise<Pick<OutreachTask, 'subject' | 'message' | 'template_id'> | null> {
  const rows = await sql`
    SELECT subject, message, template_id FROM outreach_tasks
    WHERE lead_id = ${leadId}::uuid AND channel = 'email' AND step = ${step}
  `;
  return (rows[0] as unknown as Pick<OutreachTask, 'subject' | 'message' | 'template_id'>) ?? null;
}
