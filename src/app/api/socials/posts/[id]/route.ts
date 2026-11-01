import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { deleteSocialPost } from '@/services/social/posts';
import { publishNow } from '@/services/social/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const idSchema = z.string().uuid();

/** Ștergere: doar postările nepublicate (ciornă, programată, eșuată). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Postare negăsită' }, { status: 404 });

  try {
    const deleted = await deleteSocialPost(id, access.orgId);
    if (!deleted) return NextResponse.json({ error: 'Postarea nu există sau a fost deja publicată' }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('[socials/posts/id] ștergerea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut șterge postarea' }, { status: 500 });
  }
}

/** „Publică acum”: ciornă, programată sau eșuată → publicare imediată. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!idSchema.safeParse(id).success) return NextResponse.json({ error: 'Postare negăsită' }, { status: 404 });

  try {
    const outcome = await publishNow(id, access.orgId);
    if (!outcome) return NextResponse.json({ error: 'Postarea nu există sau se publică deja' }, { status: 409 });
    return NextResponse.json({ published: outcome.ok, error: outcome.error ?? null });
  } catch (error) {
    console.error('[socials/posts/id] publicarea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut publica postarea' }, { status: 500 });
  }
}
