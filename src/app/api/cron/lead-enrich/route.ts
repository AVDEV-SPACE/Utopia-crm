import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkCronSecret } from '@/lib/cron-auth';
import { runEnrich } from '@/services/engine/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Hobby (Fluid compute): 300s maxim. Rularea își impune un buget mai mic.
export const maxDuration = 300;

/**
 * Îmbogățire + scor programat: cel mult `enrich_batch` lead-uri. Cere `Authorization: Bearer CRON_SECRET`.
 *
 * Răspunde imediat (202) și rulează în fundal cu `waitUntil`: un lot (site-uri
 * + Groq) depășește cele 30s după care cron-job.org închide cererea.
 * Rezultatul apare în „Ultimele rulări” din /pipeline (tabela engine_runs).
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  waitUntil(
    runEnrich('cron').catch((error) => {
      console.error('Cron lead-enrich eșuat:', error);
    })
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
