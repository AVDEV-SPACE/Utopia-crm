import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { getConversation, lastInboundDmAt, listConversationMessages } from '@/services/followups/conversations';
import { MESSAGING_WINDOW_MS } from '@/services/social/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Firul unei conversații + până când se mai poate răspunde în DM (fereastra de 24h). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });

  try {
    const conversation = await getConversation(id, access.orgId);
    if (!conversation || (conversation.channel !== 'facebook' && conversation.channel !== 'instagram')) {
      return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });
    }
    const [messages, lastInbound] = await Promise.all([listConversationMessages(id), lastInboundDmAt(id)]);
    return NextResponse.json(
      {
        conversation,
        messages,
        dmWindowEndsAt: lastInbound ? new Date(lastInbound.getTime() + MESSAGING_WINDOW_MS).toISOString() : null,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[socials/conversations/id] citirea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut încărca conversația' }, { status: 500 });
  }
}
