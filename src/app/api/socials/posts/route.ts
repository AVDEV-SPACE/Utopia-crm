import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { getMediaByIds } from '@/services/media/repository';
import { MAX_POST_MEDIA, postFormat, postProblem, type PostMediaItem } from '@/services/social/post-rules';
import { claimPost, createSocialPost, listSocialPosts } from '@/services/social/posts';
import { publishPost } from '@/services/social/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;
// „Publică acum” pe ambele platforme, cu un reel Instagram, așteaptă procesarea video-ului
export const maxDuration = 300;

const PLATFORM_LABELS = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' } as const;

export async function GET() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  try {
    return NextResponse.json(await listSocialPosts(access.orgId), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[socials/posts] listarea a eșuat:', error);
    const code = (error as { code?: string }).code;
    const message =
      code === '42P01' || code === '42703'
        ? 'Lipsesc tabelele postărilor — rulează setup-db-socials.sql și setup-db-content.sql în Neon'
        : 'Nu am putut încărca postările';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const bodySchema = z
  .object({
    platforms: z
      .array(z.enum(['facebook', 'instagram', 'linkedin']))
      .min(1, 'Alege cel puțin o platformă')
      .max(3)
      .transform((list) => [...new Set(list)]),
    caption: z.string().trim().max(2200, 'Textul depășește 2200 de caractere'),
    /** Elementele din biblioteca media, în ordinea de afișare */
    mediaIds: z.array(z.string().uuid()).max(MAX_POST_MEDIA, `Maximum ${MAX_POST_MEDIA} elemente`).default([]),
    /** draft = ciornă; schedule = la `scheduledAt`; now = publicare imediată */
    mode: z.enum(['draft', 'schedule', 'now']),
    scheduledAt: z.string().datetime({ offset: true }).nullish(),
  })
  .superRefine((d, ctx) => {
    if (!d.caption && d.mediaIds.length === 0) ctx.addIssue({ code: 'custom', message: 'Postarea e goală' });
    if (d.mode === 'schedule') {
      if (!d.scheduledAt) ctx.addIssue({ code: 'custom', message: 'Alege data și ora programării' });
      else if (new Date(d.scheduledAt).getTime() < Date.now() - 60_000) {
        ctx.addIssue({ code: 'custom', message: 'Data programării e în trecut' });
      }
    }
  });

/** Postare nouă (câte una pe platformă): ciornă, programată sau publicată imediat. */
export async function POST(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }
  const d = parsed.data;

  try {
    const media: PostMediaItem[] = (await getMediaByIds(access.orgId, d.mediaIds)).map(
      ({ id, url, kind, width, height, duration_s }) => ({ id, url, kind, width, height, duration_s })
    );
    if (media.length !== d.mediaIds.length) {
      return NextResponse.json({ error: 'Un fișier ales nu mai există în bibliotecă' }, { status: 400 });
    }
    for (const platform of d.platforms) {
      const problem = postProblem(platform, media);
      if (problem) return NextResponse.json({ error: `${PLATFORM_LABELS[platform]}: ${problem}` }, { status: 400 });
    }

    const scheduledAt = d.mode === 'schedule' && d.scheduledAt ? new Date(d.scheduledAt) : d.mode === 'now' ? new Date() : null;
    const posts = [];
    for (const platform of d.platforms) {
      posts.push(
        await createSocialPost({
          orgId: access.orgId,
          platform,
          status: d.mode === 'draft' ? 'draft' : 'scheduled',
          caption: d.caption,
          format: postFormat(media),
          mediaIds: d.mediaIds,
          scheduledAt,
          createdBy: access.userId,
        })
      );
    }
    if (d.mode !== 'now') return NextResponse.json({ posts });

    const results = [];
    for (const post of posts) {
      const claimed = await claimPost(post.id, access.orgId);
      const outcome = claimed ? await publishPost(claimed) : { ok: false, error: 'Postarea a fost deja preluată de job' };
      results.push({ platform: post.platform, published: outcome.ok, error: outcome.error ?? null });
    }
    return NextResponse.json({ posts, results });
  } catch (error) {
    console.error('[socials/posts] crearea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut salva postarea' }, { status: 500 });
  }
}
