import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { setHumanTakeover } from '@/services/followups/conversations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ taken_by_human: z.boolean() });

/**
 * Preluare de om pe o conversație socială. Aceeași logică ca
 * /api/followups/conversations/[id]/takeover (setHumanTakeover), dar pe
 * tenant-ul din SOCIAL_ORG_ID: ruta de follow-up filtrează după tenant-ul
 * sesiunii, care poate diferi de cel al paginilor.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body invalid: { taken_by_human: boolean }' }, { status: 400 });

  try {
    const conversation = await setHumanTakeover({
      conversationId: id,
      orgId: access.orgId,
      takenByHuman: parsed.data.taken_by_human,
      userId: access.userId,
    });
    if (!conversation) return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });
    return NextResponse.json(conversation);
  } catch (error) {
    console.error('[socials/takeover] eroare:', error);
    return NextResponse.json({ error: 'Nu am putut actualiza conversația' }, { status: 500 });
  }
}
