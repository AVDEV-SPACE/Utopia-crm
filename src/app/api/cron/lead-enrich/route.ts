import { NextRequest, NextResponse } from 'next/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { runEnrich } from '@/services/engine/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Hobby (Fluid compute): 300s maxim. Rularea își impune un buget mai mic.
export const maxDuration = 300;

/** Îmbogățire + scor programat: cel mult `enrich_batch` lead-uri. Cere `Authorization: Bearer CRON_SECRET`. */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await runEnrich('cron'));
  } catch (error) {
    console.error('Cron lead-enrich eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
