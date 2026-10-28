import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { runDiscover, runEnrich } from '@/services/engine/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const bodySchema = z.object({ kind: z.enum(['discover', 'enrich'], { message: 'kind trebuie să fie discover sau enrich' }) });

/**
 * Rulare manuală din /pipeline (butoanele „Rulează discover / enrich”).
 * Sub Clerk în middleware, plus rolul owner. Ignoră fereastra orară a cron-ului.
 */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }

  try {
    const result = parsed.data.kind === 'discover' ? await runDiscover('manual') : await runEnrich('manual');
    return NextResponse.json(result);
  } catch (error) {
    console.error('Rulare manuală motor eșuată:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
