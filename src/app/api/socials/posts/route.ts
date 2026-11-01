import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { claimPost, createSocialPost, listSocialPosts } from '@/services/social/posts';
import { publishPost } from '@/services/social/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
export const maxDuration = 120;

export async function GET() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  try {
    return NextResponse.json(await listSocialPosts(access.orgId), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[socials/posts] listarea a eșuat:', error);
    const code = (error as { code?: string }).code;
    const message = code === '42P01' ? 'Lipsește tabela social_posts — rulează setup-db-socials.sql în Neon' : 'Nu am putut încărca postările';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const bodySchema = z
  .object({
    platform: z.enum(['facebook', 'instagram']),
    caption: z.string().trim().max(2200, 'Textul depășește 2200 de caractere'),
    mediaUrl: z.string().trim().url('URL-ul imaginii nu e valid').max(2000).nullish(),
    /** draft = ciornă; schedule = la `scheduledAt`; now = publicare imediată */
    mode: z.enum(['draft', 'schedule', 'now']),
    scheduledAt: z.string().datetime({ offset: true }).nullish(),
  })
  .superRefine((d, ctx) => {
    if (d.platform === 'instagram' && !d.mediaUrl) ctx.addIssue({ code: 'custom', message: 'Instagram cere o imagine (URL public)' });
    if (!d.caption && !d.mediaUrl) ctx.addIssue({ code: 'custom', message: 'Postarea e goală' });
    if (d.mode === 'schedule') {
      if (!d.scheduledAt) ctx.addIssue({ code: 'custom', message: 'Alege data și ora programării' });
      else if (new Date(d.scheduledAt).getTime() < Date.now() - 60_000) {
        ctx.addIssue({ code: 'custom', message: 'Data programării e în trecut' });
      }
    }
  });

/** Postare nouă: ciornă, programată sau publicată imediat. */
export async function POST(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const post = await createSocialPost({
      orgId: access.orgId,
      platform: d.platform,
      status: d.mode === 'draft' ? 'draft' : 'scheduled',
      caption: d.caption,
      mediaUrl: d.mediaUrl ?? null,
      scheduledAt: d.mode === 'schedule' && d.scheduledAt ? new Date(d.scheduledAt) : d.mode === 'now' ? new Date() : null,
      createdBy: access.userId,
    });

    if (d.mode !== 'now') return NextResponse.json({ post });

    const claimed = await claimPost(post.id, access.orgId);
    const outcome = claimed ? await publishPost(claimed) : { ok: false, error: 'Postarea a fost deja preluată de job' };
    return NextResponse.json({ post, published: outcome.ok, error: outcome.error ?? null });
  } catch (error) {
    console.error('[socials/posts] crearea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut salva postarea' }, { status: 500 });
  }
}
