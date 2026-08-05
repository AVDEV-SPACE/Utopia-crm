import { sql } from '@/lib/neon';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const sessions = await sql`
      SELECT
        cs.session_id                                          AS "sessionId",
        cs.client_email                                        AS "clientEmail",
        cs.client_phone                                        AS "clientPhone",
        cs.status,
        cs.first_message                                       AS "firstMessage",
        COUNT(cm.id) FILTER (WHERE cm.role = 'user')          AS "messageCount",
        (cs.status = 'booked')                                 AS "bookedConsultation",
        cs.started_at                                          AS "startedAt",
        cs.ended_at                                            AS "endedAt"
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cm.session_id = cs.session_id
      GROUP BY
        cs.session_id,
        cs.client_email,
        cs.client_phone,
        cs.status,
        cs.first_message,
        cs.started_at,
        cs.ended_at
      ORDER BY cs.started_at DESC
    `;

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
