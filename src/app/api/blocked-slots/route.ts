// src/app/api/blocked-slots/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS blocked_slots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_date DATE NOT NULL,
      meeting_time TIME NOT NULL,
      reason TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (meeting_date, meeting_time)
    )
  `;
}

// GET /api/blocked-slots?from=YYYY-MM-DD&to=YYYY-MM-DD — listă sloturi blocate (implicit: viitoare)
export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await ensureTable();

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // to_char (nu coloana raw) — evită ca driverul să parseze DATE/TIME ca obiecte JS Date,
    // care se pot deplasa cu o zi la (de)serializare în funcție de fusul orar al procesului.
    const rows = from && to
      ? await sql`
          SELECT id, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date, to_char(meeting_time, 'HH24:MI') AS meeting_time, reason, created_at
          FROM blocked_slots
          WHERE meeting_date BETWEEN ${from}::date AND ${to}::date
          ORDER BY meeting_date ASC, meeting_time ASC
        `
      : await sql`
          SELECT id, to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date, to_char(meeting_time, 'HH24:MI') AS meeting_time, reason, created_at
          FROM blocked_slots
          WHERE meeting_date >= CURRENT_DATE
          ORDER BY meeting_date ASC, meeting_time ASC
        `;

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Error fetching blocked slots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/blocked-slots { dates: string[], times: string[], reason?: string } — blocare în masă (cross product)
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { dates, times, reason } = body as { dates: string[]; times: string[]; reason?: string };

    if (!Array.isArray(dates) || !dates.length || !Array.isArray(times) || !times.length) {
      return NextResponse.json({ error: 'dates și times sunt obligatorii (array-uri ne-goale)' }, { status: 400 });
    }

    await ensureTable();

    const pairs = dates.flatMap(date => times.map(time => ({ date, time })));

    const results = await Promise.all(
      pairs.map(({ date, time }) =>
        sql`
          INSERT INTO blocked_slots (meeting_date, meeting_time, reason, created_by)
          VALUES (${date}::date, ${time}::time, ${reason || null}, ${userId})
          ON CONFLICT (meeting_date, meeting_time) DO NOTHING
          RETURNING id
        `
      )
    );

    const inserted = results.filter(r => r.length > 0).length;
    return NextResponse.json({ success: true, inserted, requested: pairs.length });
  } catch (error) {
    console.error('Error creating blocked slots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/blocked-slots { ids?: string[], date?: string } — deblocare (individual sau toată ziua)
export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { ids, date } = body as { ids?: string[]; date?: string };

    if (Array.isArray(ids) && ids.length) {
      await Promise.all(ids.map(id => sql`DELETE FROM blocked_slots WHERE id = ${id}`));
      return NextResponse.json({ success: true });
    }

    if (date) {
      await sql`DELETE FROM blocked_slots WHERE meeting_date = ${date}::date`;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'ids sau date este obligatoriu' }, { status: 400 });
  } catch (error) {
    console.error('Error deleting blocked slots:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
