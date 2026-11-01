import { sql } from '@/lib/neon';
import type { OutreachSettings, OutreachTemplate } from './types';

/**
 * Modelele de email ale outreach-ului vin din template-urile existente
 * (`educational_templates`, pagina /educational-templates). Completarea lor
 * (placeholder-e) e în render.ts, fără DB, ca să meargă și în browser.
 */
export { isHtmlContent, renderTemplate, type TemplateLead } from './render';

export async function getTemplates(ids: number[]): Promise<Map<number, OutreachTemplate>> {
  if (ids.length === 0) return new Map();
  const rows = (await sql`
    SELECT id, title, content FROM educational_templates WHERE id = ANY(${ids}::int[])
  `) as unknown as OutreachTemplate[];
  return new Map(rows.map((t) => [t.id, t]));
}

export async function getTemplate(id: number): Promise<OutreachTemplate | null> {
  return (await getTemplates([id])).get(id) ?? null;
}

// ── Setările secvenței ──────────────────────────────────────────────────────

const MISSING_SCHEMA = 'Tabelele de outreach lipsesc din baza de date — rulează setup-db-outreach.sql în Neon';

/** Ținta zilnică până la rularea setup-db-outreach-channels.sql (coloana lipsește). */
export const DEFAULT_DAILY_TARGET = 40;

export async function getOutreachSettings(): Promise<OutreachSettings> {
  let rows;
  try {
    rows = await sql`SELECT step1_template_id, step2_template_id, step3_template_id, daily_target, updated_at FROM outreach_settings WHERE id = 1`;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01') throw new Error(MISSING_SCHEMA); // undefined_table
    if (code !== '42703') throw error; // undefined_column: daily_target, înainte de migrare
    rows = await sql`SELECT step1_template_id, step2_template_id, step3_template_id, ${DEFAULT_DAILY_TARGET}::int AS daily_target, updated_at FROM outreach_settings WHERE id = 1`;
  }
  if (!rows[0]) throw new Error(MISSING_SCHEMA);
  return rows[0] as unknown as OutreachSettings;
}

/** Template-ul ales pentru un pas (1–3); `null` = AI. */
export function templateForStep(settings: OutreachSettings, step: number): number | null {
  if (step === 1) return settings.step1_template_id;
  if (step === 2) return settings.step2_template_id;
  if (step === 3) return settings.step3_template_id;
  return null;
}

export async function updateOutreachSettings(
  next: Pick<OutreachSettings, 'step1_template_id' | 'step2_template_id' | 'step3_template_id'> & { daily_target?: number }
): Promise<OutreachSettings> {
  await sql`
    UPDATE outreach_settings SET
      step1_template_id = ${next.step1_template_id},
      step2_template_id = ${next.step2_template_id},
      step3_template_id = ${next.step3_template_id},
      updated_at        = now()
    WHERE id = 1
  `;
  if (next.daily_target !== undefined) {
    try {
      await sql`UPDATE outreach_settings SET daily_target = ${next.daily_target} WHERE id = 1`;
    } catch (error) {
      if ((error as { code?: string }).code === '42703') {
        throw new Error('Ținta zilnică cere migrarea setup-db-outreach-channels.sql în Neon');
      }
      throw error;
    }
  }
  return getOutreachSettings();
}
