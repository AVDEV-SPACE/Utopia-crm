import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

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
      LEFT JOIN contacts c ON LOWER(c.email) = LOWER(b.email)
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

    // Salvează contactul (fără a arunca eroare dacă există deja)
    if (email) {
      try {
        await sql`
          INSERT INTO contacts (full_name, email, phone, source, status)
          VALUES (${name}, ${email}, ${phone ?? null}, 'crm', 'new')
        `;
      } catch {
        // Contactul poate exista deja — ignorăm eroarea de duplicat
      }
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
