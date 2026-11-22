import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkCronSecret } from '@/lib/cron-auth';
import { pingHeartbeat } from '@/lib/heartbeat';
import { socialOrgId } from '@/services/social/config';
import { syncLinkedInComments } from '@/services/social/linkedin/comments';
import { isLinkedinConfigured } from '@/services/social/linkedin/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Comentariile LinkedIn în inbox-ul /socials (și reîmprospătarea tokenului, la nevoie).
 * Cere `Authorization: Bearer CRON_SECRET`. Programare recomandată: o dată pe oră
 * (Development Tier ~500 apeluri/zi; o rulare = ~6 apeluri).
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  const orgId = socialOrgId();
  if (!orgId || !isLinkedinConfigured()) {
    return NextResponse.json({ skipped: 'LinkedIn nu este configurat' }, { status: 200 });
  }

  waitUntil(
    syncLinkedInComments(orgId)
      .then((result) => {
        console.log('Cron linkedin-sync:', JSON.stringify(result));
        return pingHeartbeat('linkedin-sync', result.errors.length === 0 || result.posts > 0);
      })
      .catch((error) => {
        console.error('Cron linkedin-sync eșuat:', error);
        return pingHeartbeat('linkedin-sync', false);
      })
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
