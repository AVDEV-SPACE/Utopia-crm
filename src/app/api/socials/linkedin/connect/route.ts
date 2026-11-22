import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { requireSocialAccess } from '@/lib/social-auth';
import { LINKEDIN_STATE_COOKIE, missingLinkedinEnv } from '@/services/social/linkedin/config';
import { authorizeUrl } from '@/services/social/linkedin/oauth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * „Conectează LinkedIn” din /socials: redirect spre ecranul de autorizare
 * LinkedIn. Doar owner-ul CRM-ului; trebuie să fie și admin al paginii.
 */
export async function GET() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const missing = missingLinkedinEnv();
  if (missing.length > 0) {
    return NextResponse.json({ error: `Lipsesc variabilele: ${missing.join(', ')}` }, { status: 503 });
  }

  const state = randomBytes(24).toString('hex');
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // `lax`: cookie-ul trebuie să vină înapoi la redirect-ul top-level de la LinkedIn
    sameSite: 'lax',
    path: '/api/socials/linkedin',
    maxAge: 600,
  });
  return res;
}
