import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');

  try {
    if (date) {
      // Folosit de Header pentru verificarea conflictelor de timp
      const data = await sql`
        SELECT meeting_time AS time
        FROM bookings
        WHERE meeting_date = ${date}::date
          AND status != 'cancelled'
      `;
      return NextResponse.json(data);
    }

    const services = searchParams.get('services');
    if (services === '1') {
      const rows = await sql`
        SELECT DISTINCT service FROM bookings
        WHERE service IS NOT NULL
        ORDER BY service
      `;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return NextResponse.json(rows.map((r: any) => r.service as string));
    }

    const data = await sql`
      SELECT
        b.id::text,
        b.name,
        b.email,
        c.phone,
        b.company       AS company_name,
        b.meeting_date,
        b.meeting_time,
        b.service,
        b.status,
        b.meet_link,
        b.message,
        b.created_at
      FROM bookings b
      -- contacts nu are email unic (site-ul creează câte un contact la fiecare formular),
      -- așa că alegem un singur contact per programare, altfel rândul se multiplică
      LEFT JOIN LATERAL (
        SELECT phone
        FROM contacts
        WHERE LOWER(email) = LOWER(b.email)
        ORDER BY
          (LOWER(full_name) = LOWER(b.name)) DESC,
          (phone IS NOT NULL) DESC,
          created_at DESC
        LIMIT 1
      ) c ON true
      ORDER BY b.created_at DESC
    `;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, phone, email, service, date, time, company, message } = body;

    const result = await sql`
      INSERT INTO bookings (meeting_date, meeting_time, name, email, company, message, service, status)
      VALUES (
        ${date}::date,
        ${time},
        ${name},
        ${email},
        ${company ?? null},
        ${message ?? null},
        ${service ?? null},
        'confirmed'
      )
      RETURNING id::text, meeting_date, meeting_time, name, email, company, service, status, created_at
    `;

    // Salvează contactul doar dacă emailul nu există deja (tabela nu are constrângere unică pe email)
    if (email) {
      try {
        await sql`
          INSERT INTO contacts (full_name, email, phone, source, status)
          SELECT ${name}, ${email}, ${phone ?? null}, 'crm', 'new'
          WHERE NOT EXISTS (
            SELECT 1 FROM contacts WHERE LOWER(email) = LOWER(${email})
          )
        `;
      } catch (err) {
        console.error('Error saving booking contact:', err);
      }
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
