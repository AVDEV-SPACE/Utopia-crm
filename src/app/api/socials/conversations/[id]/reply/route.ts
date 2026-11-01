import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import {
  appendSocialMessage,
  getConversation,
  lastInboundDmAt,
  listConversationMessages,
  setHumanTakeover,
} from '@/services/followups/conversations';
import { GraphError, MESSAGE_MAX_CHARS, replyFacebookComment, replyInstagramComment } from '@/services/social/graph';
import { MESSAGING_WINDOW_MS, sendSocialMessage } from '@/services/social/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  text: z.string().trim().min(1, 'Mesajul e gol').max(2000),
  /** Comentariul la care se răspunde public; lipsă = DM în conversație */
  commentId: z.string().uuid().nullish(),
});

/**
 * Răspuns manual din inbox-ul /socials: DM (doar în fereastra de 24h a Meta)
 * sau răspuns public la un comentariu. Un răspuns uman preia conversația, ca
 * AI-ul să nu intervină peste el.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }

  try {
    const conversation = await getConversation(id, access.orgId);
    if (!conversation?.external_user_id || (conversation.channel !== 'facebook' && conversation.channel !== 'instagram')) {
      return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });
    }
    const channel = conversation.channel;
    const { text, commentId } = parsed.data;

    let externalId: string | null;
    let kind: 'dm' | 'comment';
    let parentId: string | null = null;

    if (commentId) {
      const target = (await listConversationMessages(id)).find((m) => m.id === commentId && m.kind === 'comment' && m.role === 'user');
      if (!target?.external_id) return NextResponse.json({ error: 'Comentariul nu a fost găsit' }, { status: 404 });
      externalId =
        channel === 'instagram'
          ? await replyInstagramComment(target.external_id, text)
          : await replyFacebookComment(target.external_id, text);
      kind = 'comment';
      parentId = target.external_id;
    } else {
      const lastInbound = await lastInboundDmAt(id);
      if (!lastInbound || Date.now() - lastInbound.getTime() > MESSAGING_WINDOW_MS) {
        return NextResponse.json(
          { error: 'Fereastra de 24h a expirat: Meta permite DM doar ca răspuns la un mesaj primit în ultimele 24h' },
          { status: 409 }
        );
      }
      externalId = await sendSocialMessage(channel, conversation.external_user_id, text.slice(0, MESSAGE_MAX_CHARS[channel]));
      kind = 'dm';
    }

    const message = await appendSocialMessage({ conversationId: id, role: 'human', body: text, externalId, kind, externalParentId: parentId });
    await setHumanTakeover({ conversationId: id, orgId: access.orgId, takenByHuman: true, userId: access.userId });
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof GraphError) {
      console.warn('[socials/reply] Graph a refuzat:', error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    }
    console.error('[socials/reply] trimiterea a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut trimite răspunsul' }, { status: 500 });
  }
}
