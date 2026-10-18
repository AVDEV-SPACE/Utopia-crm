import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteLeadNote, updateLeadNote, NOTE_KINDS } from '@/services/leads/notes';
import { getTenantContext } from '@/lib/tenant';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

type Params = { params: Promise<{ id: string; noteId: string }> };

const patchSchema = z.object({
  kind: z.enum(NOTE_KINDS).exclude(['status']).optional(),
  body: z.string().trim().min(1, 'Nota nu poate fi goală').max(10000).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id, noteId } = await params;
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Date invalide' },
        { status: 400 }
      );
    }

    const note = await updateLeadNote(id, noteId, parsed.data);
    if (!note) return NextResponse.json({ error: 'Notă negăsită' }, { status: 404 });
    return NextResponse.json(note);
  } catch (error) {
    console.error('Error updating lead note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id, noteId } = await params;
    const removed = await deleteLeadNote(id, noteId);
    if (!removed) return NextResponse.json({ error: 'Notă negăsită' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead note:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
