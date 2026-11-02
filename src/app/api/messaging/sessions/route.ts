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
        cs.client_name                                         AS "clientName",
        -- Citit prin to_jsonb: lista se încarcă și dacă setup-db-chat-takeover.sql
        -- nu a rulat încă (coloana lipsă → false), în loc să cadă tot query-ul.
        COALESCE((to_jsonb(cs) ->> 'taken_by_human')::boolean, false) AS "takenByHuman",
        cs.status,
        cs.first_message                                       AS "firstMessage",
        COUNT(cm.id) FILTER (WHERE cm.role = 'user')          AS "messageCount",
        (cs.status = 'booked')                                 AS "bookedConsultation",
        cs.started_at                                          AS "startedAt",
        cs.ended_at                                            AS "endedAt"
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cm.session_id = cs.session_id
      -- Grupare după cheia primară: Postgres permite atunci orice coloană din cs
      GROUP BY cs.id
      -- Widget-ul de pe site deschide o sesiune „pending” la fiecare încărcare, chiar dacă
      -- nimeni nu scrie; afișăm doar conversațiile în care userul a scris cel puțin un mesaj.
      HAVING COUNT(cm.id) FILTER (WHERE cm.role = 'user') > 0
      ORDER BY cs.started_at DESC
    `;

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error fetching chat sessions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
