import { sql } from '@/lib/neon';
import { engineOrgId } from '@/services/engine/run';
import { statusForStage } from './stages';
import { PIPELINE_SOURCE } from './repository';

/**
 * Lead-ul de test al utilizatorului: un lead din pipeline cu datele lui (email,
 * telefon, Instagram), ca să vadă cap-coadă cum pleacă mesajele, cum le primește
 * și cum se schimbă etapa. Câte unul per utilizator (`source_ref` fix), deci
 * „creează” pe un lead existent îl resetează.
 */

export interface TestLeadInput {
  name: string;
  email: string;
  phone: string | null;
  instagram: string | null;
}

export interface TestLeadInfo {
  id: string;
  company_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_instagram: string | null;
  pipeline_stage: string | null;
}

const refFor = (userId: string) => `test:self:${userId}`;

const PITCH_SUBJECT = 'Test outreach — programările care se pierd seara';
const PITCH_BODY = [
  'Bună ziua,',
  '',
  'Mesaj de test din Utopia CRM: clienții caută programare seara sau în weekend, iar cererile fără răspuns ajung la concurență.',
  '',
  'Construim pe date, nu pe presupuneri: fiecare cerere e măsurată din prima zi. (Răspunde la acest email ca să testezi detectarea răspunsurilor.)',
].join('\n');
const DM = 'Bună ziua, mesaj de test din Utopia CRM: cererile fără răspuns seara ajung la concurență. Construim pe date, nu pe presupuneri.';

export async function getTestLead(userId: string): Promise<TestLeadInfo | null> {
  const rows = await sql`
    SELECT id::text, company_name, contact_email, contact_phone, contact_instagram, pipeline_stage
    FROM leads WHERE source_ref = ${refFor(userId)}
  `;
  return (rows[0] as unknown as TestLeadInfo) ?? null;
}

/**
 * Creează sau resetează lead-ul de test: etapa revine la QUEUED_EMAIL, pașii
 * automați se șterg (ca secvența să se poată planifica din nou). Istoricul
 * (evenimente, mesaje trimise) rămâne, ca să vezi și testele anterioare.
 */
export async function upsertTestLead(userId: string, input: TestLeadInput): Promise<TestLeadInfo> {
  const details = {
    source: 'test',
    reason: 'Lead de test cu datele tale — mesajele trimise ajung la tine.',
    icpMatch: true,
    segment: 'B',
    signals: { activeOnSocial: Boolean(input.instagram), icpMatch: true },
    social: { instagram: input.instagram, facebook: null, linkedin: null },
    audit: { issues: ['Programări doar telefonic (exemplu de test)'] },
    instagramDm: DM,
    linkedinDm: DM,
    firstLine: null,
    discovery: null,
  };

  const rows = await sql`
    INSERT INTO leads (
      org_id, source, source_ref, company_name, niche, category, location,
      contact_email, contact_phone, contact_instagram, pitch_subject, pitch_generated, pitch_channel,
      score_details, pipeline_stage, status, icp_match, segment, score
    ) VALUES (
      ${engineOrgId()}, ${PIPELINE_SOURCE}, ${refFor(userId)}, ${`TEST — ${input.name}`.slice(0, 300)}, 'test', 'test', 'Test',
      ${input.email}, ${input.phone}, ${input.instagram}, ${PITCH_SUBJECT}, ${PITCH_BODY}, 'email',
      ${JSON.stringify(details)}::jsonb, 'QUEUED_EMAIL', ${statusForStage('QUEUED_EMAIL')}, true, 'B', 99
    )
    ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO UPDATE SET
      company_name      = EXCLUDED.company_name,
      contact_email     = EXCLUDED.contact_email,
      contact_phone     = EXCLUDED.contact_phone,
      contact_instagram = EXCLUDED.contact_instagram,
      pitch_subject     = EXCLUDED.pitch_subject,
      pitch_generated   = EXCLUDED.pitch_generated,
      score_details     = EXCLUDED.score_details,
      pipeline_stage    = 'QUEUED_EMAIL',
      status            = EXCLUDED.status,
      icp_match         = true,
      updated_at        = now()
    RETURNING id::text, company_name, contact_email, contact_phone, contact_instagram, pipeline_stage
  `;
  const lead = rows[0] as unknown as TestLeadInfo;

  try {
    await sql`DELETE FROM outreach_tasks WHERE lead_id = ${lead.id}::uuid`;
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') throw error; // fără tabelele de outreach nu e nimic de șters
  }
  return lead;
}

export async function deleteTestLead(userId: string): Promise<boolean> {
  const rows = await sql`DELETE FROM leads WHERE source_ref = ${refFor(userId)} RETURNING id`;
  return rows.length > 0;
}
