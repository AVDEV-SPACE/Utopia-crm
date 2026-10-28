import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { resolveNiche } from '@/services/engine/osm';
import { runDiscover, runEnrich } from '@/services/engine/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const optionalText = z.string().trim().max(80).optional();

const bodySchema = z
  .object({
    kind: z.enum(['discover', 'enrich'], { message: 'kind trebuie să fie discover sau enrich' }),
    niche: optionalText,
    city: optionalText,
  })
  .refine((d) => d.kind !== 'discover' || Boolean(d.niche) === Boolean(d.city), {
    message: 'Completează și nișa, și orașul — sau lasă-le goale pentru rotația din setări',
  })
  .refine((d) => !d.niche || resolveNiche(d.niche) !== null, {
    message: 'Nișa e prea scurtă pentru căutare (minim 3 litere)',
  });

/**
 * Rulare manuală din /pipeline (butoanele „Rulează discover / enrich”).
 * Sub Clerk în middleware, plus rolul owner. Ignoră fereastra orară a cron-ului.
 * Discover cu `niche` + `city` caută exact perechea aleasă; fără ele, rotația.
 */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Date invalide', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  const { kind, niche, city } = parsed.data;
  try {
    const result =
      kind === 'discover'
        ? await runDiscover('manual', niche && city ? { niche, city } : undefined)
        : await runEnrich('manual');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Rulare manuală motor eșuată:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
