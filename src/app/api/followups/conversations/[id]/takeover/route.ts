import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant';
import { setHumanTakeover } from '@/services/followups/conversations';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ taken_by_human: z.boolean() });

/**
 * Un operator marchează că preia (sau eliberează) conversația.
 * Cât timp preluarea e activă — în fereastra `human_takeover_minutes` din
 * setări — webhook-ul unificat nu mai generează răspunsuri AI.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id } = await params;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Body invalid: { taken_by_human: boolean }' }, { status: 400 });
    }

    const conversation = await setHumanTakeover({
      conversationId: id,
      orgId: tenant.orgId,
      takenByHuman: parsed.data.taken_by_human,
      userId: tenant.userId,
    });
    if (!conversation) {
      return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });
    }

    return NextResponse.json(conversation);
  } catch (error) {
    console.error('[followups/conversations/takeover] error:', error);
    return NextResponse.json({ error: 'Nu am putut actualiza conversația' }, { status: 500 });
  }
}
