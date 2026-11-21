import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { MEDIA_LIMITS } from '@/services/media/limits';
import { createMedia, listMedia } from '@/services/media/repository';
import { mediaStore } from '@/services/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function tableError(error: unknown, fallback: string): string {
  const code = (error as { code?: string }).code;
  return code === '42P01' || code === '42703' ? 'Lipsește biblioteca media — rulează setup-db-content.sql în Neon' : fallback;
}

/** Biblioteca media, cele mai noi întâi. */
export async function GET() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  try {
    return NextResponse.json(
      { media: await listMedia(access.orgId), storageConfigured: mediaStore().configured },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[socials/media] listarea a eșuat:', error);
    return NextResponse.json({ error: tableError(error, 'Nu am putut încărca biblioteca media') }, { status: 500 });
  }
}

const bodySchema = z
  .object({
    url: z.string().url().max(2000),
    pathname: z.string().max(500),
    kind: z.enum(['image', 'video']),
    mime: z.string().max(100),
    sizeBytes: z.number().int().positive(),
    width: z.number().int().positive().nullish(),
    height: z.number().int().positive().nullish(),
    durationS: z.number().positive().nullish(),
    name: z.string().trim().max(200).nullish(),
  })
  .superRefine((d, ctx) => {
    const limits = MEDIA_LIMITS[d.kind];
    if (!limits.types.includes(d.mime)) ctx.addIssue({ code: 'custom', message: `Tip de fișier neacceptat: ${d.mime}` });
    if (d.sizeBytes > limits.maxBytes) ctx.addIssue({ code: 'custom', message: 'Fișierul depășește limita de mărime' });
  });

/**
 * Înregistrează în bibliotecă un fișier tocmai încărcat de browser în store
 * (upload direct, prin tokenul de la /api/socials/media/upload).
 */
export async function POST(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }
  const d = parsed.data;
  if (!mediaStore().owns(d.url)) return NextResponse.json({ error: 'Fișierul nu provine din store-ul nostru' }, { status: 400 });

  try {
    const media = await createMedia({
      orgId: access.orgId,
      kind: d.kind,
      origin: 'upload',
      url: d.url,
      pathname: d.pathname,
      name: d.name ?? null,
      mime: d.mime,
      sizeBytes: d.sizeBytes,
      width: d.width ?? null,
      height: d.height ?? null,
      durationS: d.durationS ?? null,
      createdBy: access.userId,
    });
    return NextResponse.json({ media });
  } catch (error) {
    console.error('[socials/media] înregistrarea a eșuat:', error);
    return NextResponse.json({ error: tableError(error, 'Nu am putut salva fișierul în bibliotecă') }, { status: 500 });
  }
}
