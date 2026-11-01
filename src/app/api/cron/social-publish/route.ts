import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkCronSecret } from '@/lib/cron-auth';
import { publishDuePosts } from '@/services/social/publish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Bugetul unei rulări: o postare Instagram poate aștepta ~60s procesarea imaginii. */
const BUDGET_MS = 240_000;

/**
 * Publicarea postărilor programate pe Facebook / Instagram (/socials). Cere
 * `Authorization: Bearer CRON_SECRET`. Răspunde imediat (202) și rulează în
 * fundal: publicarea IG depășește cele 30s ale cron-job.org.
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  waitUntil(
    publishDuePosts(BUDGET_MS)
      .then((result) => console.log('Cron social-publish:', JSON.stringify(result)))
      .catch((error) => console.error('Cron social-publish eșuat:', error))
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
