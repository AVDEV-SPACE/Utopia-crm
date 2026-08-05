import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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
      ORDER BY created_at ASC
    `;

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
