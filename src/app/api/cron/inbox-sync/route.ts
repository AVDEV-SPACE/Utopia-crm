import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkCronSecret } from '@/lib/cron-auth';
import { runInboxSync } from '@/services/outreach/inbox';
import { BACKGROUND_BUDGET_MS } from '@/services/outreach/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Răspunsurile la outreach: sincronizarea Gmail din „Mesaje trimise” + clasificarea
 * răspunsurilor noi. Cere `Authorization: Bearer CRON_SECRET`.
 * Răspunde imediat (202) și rulează în fundal: IMAP + Groq depășesc cele 30s ale cron-job.org.
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  waitUntil(
    runInboxSync(BACKGROUND_BUDGET_MS)
      .then((result) => console.log('Cron inbox-sync:', JSON.stringify(result)))
      .catch((error) => console.error('Cron inbox-sync eșuat:', error))
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
