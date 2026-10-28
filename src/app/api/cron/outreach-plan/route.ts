import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkCronSecret } from '@/lib/cron-auth';
import { runOutreachPlan } from '@/services/outreach/plan';
import { BACKGROUND_BUDGET_MS } from '@/services/outreach/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Generatorul de secvențe (pașii 1–3 pentru leadurile din coadă). Cere `Authorization: Bearer CRON_SECRET`.
 * Răspunde imediat (202) și rulează în fundal: apelurile Groq depășesc cele 30s ale cron-job.org.
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  waitUntil(
    runOutreachPlan(BACKGROUND_BUDGET_MS)
      .then((result) => console.log('Cron outreach-plan:', JSON.stringify(result)))
      .catch((error) => console.error('Cron outreach-plan eșuat:', error))
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
