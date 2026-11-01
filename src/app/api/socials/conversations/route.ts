import { NextRequest, NextResponse } from 'next/server';
import { requireSocialAccess } from '@/lib/social-auth';
import { listSocialConversations } from '@/services/followups/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Inbox-ul /socials: conversațiile Facebook / Instagram, cele mai recente sus. `?channel=` filtrează. */
export async function GET(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const channelParam = req.nextUrl.searchParams.get('channel');
  const channel = channelParam === 'facebook' || channelParam === 'instagram' ? channelParam : null;

  try {
    const conversations = await listSocialConversations(access.orgId, channel);
    return NextResponse.json(conversations, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('[socials/conversations] listarea a eșuat:', error);
    const code = (error as { code?: string }).code;
    const message =
      code === '42P01' || code === '42703'
        ? 'Lipsesc tabelele pentru socials — rulează setup-db-socials.sql în Neon'
        : 'Nu am putut încărca conversațiile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
