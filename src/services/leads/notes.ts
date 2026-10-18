import { sql } from '@/lib/neon';

export const NOTE_KINDS = ['note', 'call', 'meeting', 'email', 'whatsapp', 'status'] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface LeadNote {
  id: string;
  lead_id: string;
  org_id: string | null;
  author_id: string | null;
  author_name: string | null;
  kind: NoteKind;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface NewLeadNote {
  leadId: string;
  orgId: string | null;
  authorId: string | null;
  authorName: string | null;
  kind: NoteKind;
  body: string;
}

/** Istoricul unui lead, cel mai recent primul. */
export async function listLeadNotes(leadId: string, limit = 200): Promise<LeadNote[]> {
  const rows = await sql`
    SELECT * FROM lead_notes
    WHERE lead_id = ${leadId}::uuid
    ORDER BY created_at DESC
    LIMIT ${Math.min(Math.max(limit, 1), 500)}
  `;
  return rows as unknown as LeadNote[];
}

export async function createLeadNote(input: NewLeadNote): Promise<LeadNote> {
  const rows = await sql`
    INSERT INTO lead_notes (lead_id, org_id, author_id, author_name, kind, body)
    VALUES (
      ${input.leadId}::uuid, ${input.orgId}, ${input.authorId},
      ${input.authorName}, ${input.kind}, ${input.body}
    )
    RETURNING *
  `;
  return rows[0] as unknown as LeadNote;
}

/** Editează textul/tipul unei note. Întoarce `null` dacă nota nu e a lead-ului dat. */
export async function updateLeadNote(
  leadId: string,
  noteId: string,
  patch: { body?: string; kind?: NoteKind }
): Promise<LeadNote | null> {
  const rows = await sql`
    UPDATE lead_notes SET
      body       = COALESCE(${patch.body ?? null}, body),
      kind       = COALESCE(${patch.kind ?? null}, kind),
      updated_at = now()
    WHERE id = ${noteId}::uuid AND lead_id = ${leadId}::uuid
    RETURNING *
  `;
  return (rows[0] as unknown as LeadNote) ?? null;
}

export async function deleteLeadNote(leadId: string, noteId: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM lead_notes
    WHERE id = ${noteId}::uuid AND lead_id = ${leadId}::uuid
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Notă generată automat la schimbarea statusului, ca istoricul să arate și
 * prin ce etape a trecut lead-ul, nu doar ce s-a scris manual.
 * Eșecul e ne-fatal: nu vrem să pice actualizarea lead-ului din cauza jurnalului.
 */
export async function logStatusChange(input: {
  leadId: string;
  orgId: string | null;
  authorId: string | null;
  authorName: string | null;
  from: string;
  to: string;
}): Promise<void> {
  try {
    await createLeadNote({
      leadId: input.leadId,
      orgId: input.orgId,
      authorId: input.authorId,
      authorName: input.authorName,
      kind: 'status',
      body: `Status schimbat: ${input.from} → ${input.to}`,
    });
  } catch (err) {
    console.error('Nu am putut jurnaliza schimbarea de status:', err);
  }
}
