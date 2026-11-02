import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const postSchema = z.object({
  sessionId: z.string().min(1),
  content: z.string().trim().min(1).max(2000),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  try {
    const messages = await sql`
      SELECT
        id,
        session_id  AS "sessionId",
        role,
        content,
        created_at  AS "createdAt"
      FROM chat_messages
      WHERE session_id = ${sessionId}
      ORDER BY created_at ASC, id ASC
    `;

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Mesaj scris de operator în conversația de pe site. Trimiterea preia automat
 * conversația, ca agentul AI să nu răspundă peste operator.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body invalid: { sessionId, content }' }, { status: 400 });
  const { sessionId, content } = parsed.data;

  try {
    const [, inserted] = await sql.transaction([
      sql`
        UPDATE chat_sessions
        SET taken_by_human = true,
            taken_at       = COALESCE(taken_at, NOW())
        WHERE session_id = ${sessionId}
      `,
      sql`
        INSERT INTO chat_messages (session_id, role, content, created_at)
        SELECT ${sessionId}, 'human', ${content}, NOW()
        WHERE EXISTS (SELECT 1 FROM chat_sessions WHERE session_id = ${sessionId})
        RETURNING id, session_id AS "sessionId", role, content, created_at AS "createdAt"
      `,
    ]);
    if (inserted.length === 0) return NextResponse.json({ error: 'Conversație negăsită' }, { status: 404 });
    return NextResponse.json(inserted[0]);
  } catch (error) {
    console.error('Error sending operator message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
