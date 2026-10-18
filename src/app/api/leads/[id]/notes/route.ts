import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLeadById } from '@/services/leads/repository';
import { createLeadNote, listLeadNotes, NOTE_KINDS } from '@/services/leads/notes';
import { getTenantContext } from '@/lib/tenant';
import { currentUserLabel } from '@/lib/user-label';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id } = await params;
    const notes = await listLeadNotes(id);
    return NextResponse.json(notes, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Error fetching lead notes:', error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

const createSchema = z.object({
  // 'status' e rezervat notelor generate automat la schimbarea statusului
  kind: z.enum(NOTE_KINDS).exclude(['status']).default('note'),
  body: z.string().trim().min(1, 'Nota nu poate fi goală').max(10000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id } = await params;
    if (!(await getLeadById(id))) {
      return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });
    }

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Date invalide' },
        { status: 400 }
      );
    }

    const note = await createLeadNote({
      leadId: id,
      orgId: tenant.orgId,
      authorId: tenant.userId,
      authorName: await currentUserLabel(),
      kind: parsed.data.kind,
      body: parsed.data.body,
    });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error('Error creating lead note:', error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

/** 42P01 = undefined_table — migrarea nu a fost rulată pe baza de date curentă. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '42P01') {
    return 'Tabela lead_notes lipsește. Rulează setup-db-lead-notes.sql în Neon (sau POST /api/setup).';
  }
  return 'Internal server error';
}
