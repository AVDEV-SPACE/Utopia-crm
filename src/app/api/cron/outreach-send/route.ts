import { NextRequest, NextResponse } from 'next/server';
import { checkCronSecret } from '@/lib/cron-auth';
import { runOutreachSend } from '@/services/outreach/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Trimiterea emailurilor de outreach: maximum 2 pe rulare, luni–vineri
 * 09–17 (ora României), în limita plafonului zilnic. Garda pe oră e în
 * handler, nu doar în programator. Cere `Authorization: Bearer CRON_SECRET`.
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  try {
    return NextResponse.json(await runOutreachSend(req.nextUrl.origin));
  } catch (error) {
    console.error('Cron outreach-send eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
