import { sql } from '@/lib/neon';
import type { OutreachSettings, OutreachTemplate } from './types';

/**
 * Modelele de email ale outreach-ului vin din template-urile existente
 * (`educational_templates`, pagina /educational-templates). Placeholder-e:
 * {{name}} — numele firmei (ca la trimiterea manuală), {{oras}}, {{nisa}}.
 */

/** Conținutul e HTML dacă are tag-uri; altfel e text simplu (paragrafe separate prin rând liber). */
export const isHtmlContent = (content: string) => /<\/?[a-z][^>]*>/i.test(content);

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface TemplateLead {
  company_name: string;
  location: string | null;
  niche: string | null;
}

/** Înlocuiește placeholder-ele; în HTML valorile sunt escapate (un nume cu `&` sau `<` nu strică markup-ul). */
export function renderTemplate(text: string, lead: TemplateLead, html = isHtmlContent(text)): string {
  const values: Record<string, string> = {
    name: lead.company_name,
    oras: lead.location ?? '',
    nisa: lead.niche ?? '',
  };
  return text.replace(/\{\{\s*(name|oras|nisa)\s*\}\}/g, (_, key: string) =>
    html ? escapeHtml(values[key]) : values[key]
  );
}

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

export async function getOutreachSettings(): Promise<OutreachSettings> {
  let rows;
  try {
    rows = await sql`SELECT step1_template_id, step2_template_id, step3_template_id, updated_at FROM outreach_settings WHERE id = 1`;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') throw new Error(MISSING_SCHEMA); // undefined_table
    throw error;
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
  next: Pick<OutreachSettings, 'step1_template_id' | 'step2_template_id' | 'step3_template_id'>
): Promise<OutreachSettings> {
  const rows = await sql`
    UPDATE outreach_settings SET
      step1_template_id = ${next.step1_template_id},
      step2_template_id = ${next.step2_template_id},
      step3_template_id = ${next.step3_template_id},
      updated_at        = now()
    WHERE id = 1
    RETURNING step1_template_id, step2_template_id, step3_template_id, updated_at
  `;
  return rows[0] as unknown as OutreachSettings;
}
