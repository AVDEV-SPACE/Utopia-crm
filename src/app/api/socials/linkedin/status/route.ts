import { NextResponse } from 'next/server';
import { requireSocialAccess } from '@/lib/social-auth';
import { linkedinStatus } from '@/services/social/linkedin/status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Tab-ul LinkedIn din /socials: env lipsă (doar nume), conexiunea salvată și verificările live. Fără tokeni. */
export async function GET() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  try {
    return NextResponse.json(await linkedinStatus(access.orgId), { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[linkedin/status] eșuat:', (error as Error).message);
    const code = (error as { code?: string }).code;
    const message = code === '42P01' ? 'Rulează setup-db-linkedin.sql în Neon' : 'Nu am putut verifica LinkedIn';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
