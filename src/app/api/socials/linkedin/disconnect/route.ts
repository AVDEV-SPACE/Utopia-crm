import { NextResponse } from 'next/server';
import { requireSocialAccess } from '@/lib/social-auth';
import { deleteConnection } from '@/services/social/linkedin/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * „Deconectează” din /socials → LinkedIn: șterge tokenii salvați. Accesul
 * aplicației se revocă complet din contul LinkedIn al adminului (Settings →
 * Data privacy → Permitted services).
 */
export async function POST() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  try {
    await deleteConnection(access.orgId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[linkedin/disconnect] eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut deconecta LinkedIn' }, { status: 500 });
  }
}
