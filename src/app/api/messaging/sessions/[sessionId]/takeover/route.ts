import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ taken_by_human: z.boolean() });

/**
 * Preluare de om pe o conversație cu agentul de pe site. Cât timp e preluată,
 * /api/chat/llm de pe site nu mai răspunde; la predare, agentul continuă.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body invalid: { taken_by_human: boolean }' }, { status: 400 });

  try {
    const rows = await sql`
      UPDATE chat_sessions
      SET taken_by_human = ${parsed.data.taken_by_human},
          taken_at       = CASE WHEN ${parsed.data.taken_by_human} THEN NOW() ELSE NULL END
      WHERE session_id = ${sessionId}
      RETURNING session_id AS "sessionId", taken_by_human AS "takenByHuman"
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('Error updating chat takeover:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
