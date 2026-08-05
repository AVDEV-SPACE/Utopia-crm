import { sql } from '@/lib/neon';
import { Lead, LeadStatus, NewLeadInput, PitchChannel } from './types';

export async function listLeads(): Promise<Lead[]> {
  const rows = await sql`
    SELECT * FROM leads ORDER BY created_at DESC
  `;
  return rows as unknown as Lead[];
}

export async function getLeadById(id: string): Promise<Lead | null> {
  const rows = await sql`
    SELECT * FROM leads WHERE id = ${id}
  `;
  return (rows[0] as unknown as Lead) ?? null;
}

export async function insertLead(input: NewLeadInput): Promise<Lead> {
  const rows = await sql`
    INSERT INTO leads (
      company_name, website, niche, location, score, score_details,
      contact_email, contact_phone, status
    ) VALUES (
      ${input.company_name}, ${input.website}, ${input.niche}, ${input.location},
      ${input.score}, ${JSON.stringify(input.score_details)},
      ${input.contact_email ?? null}, ${input.contact_phone ?? null}, 'scored'
    )
    RETURNING *
  `;
  return rows[0] as unknown as Lead;
}

export interface ManualLeadInput {
  company_name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  niche?: string | null;
  location?: string | null;
}

// Adăugare manuală de lead/potențial client (fără scanare/scoring), din UI-ul CRM.
export async function createManualLead(input: ManualLeadInput): Promise<Lead> {
  const rows = await sql`
    INSERT INTO leads (company_name, niche, location, contact_email, contact_phone, status)
    VALUES (
      ${input.company_name}, ${input.niche ?? null}, ${input.location ?? null},
      ${input.contact_email ?? null}, ${input.contact_phone ?? null}, 'new'
    )
    RETURNING *
  `;
  return rows[0] as unknown as Lead;
}

export interface LeadPatch {
  status?: LeadStatus;
  notes?: string | null;
  pitch_generated?: string | null;
  pitch_subject?: string | null;
  pitch_channel?: PitchChannel;
  payment_link?: string | null;
  contact_email?: string | null;
  contact_instagram?: string | null;
  contact_phone?: string | null;
}

export async function updateLead(id: string, patch: LeadPatch): Promise<Lead | null> {
  const rows = await sql`
    UPDATE leads SET
      status             = COALESCE(${patch.status ?? null}, status),
      notes               = COALESCE(${patch.notes ?? null}, notes),
      pitch_generated      = COALESCE(${patch.pitch_generated ?? null}, pitch_generated),
      pitch_subject        = COALESCE(${patch.pitch_subject ?? null}, pitch_subject),
      pitch_channel        = COALESCE(${patch.pitch_channel ?? null}, pitch_channel),
      payment_link        = COALESCE(${patch.payment_link ?? null}, payment_link),
      contact_email        = COALESCE(${patch.contact_email ?? null}, contact_email),
      contact_instagram    = COALESCE(${patch.contact_instagram ?? null}, contact_instagram),
      contact_phone        = COALESCE(${patch.contact_phone ?? null}, contact_phone),
      updated_at          = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as unknown as Lead) ?? null;
}
