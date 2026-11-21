import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { deleteMediaRow, getMedia, isMediaInUse } from '@/services/media/repository';
import { mediaStore } from '@/services/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

/**
 * Ștergere din bibliotecă: fișierul din store, apoi rândul. Refuzată cât timp
 * o postare nepublicată îl folosește (după publicare, Meta are propria copie).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Fișier negăsit' }, { status: 404 });

  try {
    const media = await getMedia(id, access.orgId);
    if (!media) return NextResponse.json({ error: 'Fișier negăsit' }, { status: 404 });
    if (await isMediaInUse(id, access.orgId)) {
      return NextResponse.json({ error: 'Fișierul e folosit de o postare nepublicată — șterge întâi postarea' }, { status: 409 });
    }
    const store = mediaStore();
    if (store.owns(media.url)) await store.remove(media.url);
    await deleteMediaRow(id, access.orgId);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[socials/media/id] ștergerea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut șterge fișierul' }, { status: 500 });
  }
}
