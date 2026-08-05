import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const service    = searchParams.get('service');
    const timeFilter = searchParams.get('timeFilter') || 'all';

    let startDate: Date | null = null;
    if (timeFilter !== 'all') {
      const now = new Date();
      switch (timeFilter) {
        case '30_days':   startDate = new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000); break;
        case '3_months':  startDate = new Date(now.getTime() - 90  * 24 * 60 * 60 * 1000); break;
        case '6_months':  startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); break;
        case '12_months': startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000); break;
      }
    }

    // Baza query: contacts care au cel puțin un booking (INNER JOIN)
    // DISTINCT ON (c.email) — un contact per email, cel mai recent booking
    let patients;

    if (service && startDate) {
      patients = await sql`
        SELECT DISTINCT ON (c.email)
          c.id::text  AS id,
          c.full_name AS name,
          c.email,
          c.phone,
          b.service,
          b.created_at
        FROM contacts c
        INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
        WHERE c.email IS NOT NULL
          AND b.service = ${service}
          AND b.created_at >= ${startDate.toISOString()}
        ORDER BY c.email, b.created_at DESC
        LIMIT 100
      `;
    } else if (service) {
      patients = await sql`
        SELECT DISTINCT ON (c.email)
          c.id::text  AS id,
          c.full_name AS name,
          c.email,
          c.phone,
          b.service,
          b.created_at
        FROM contacts c
        INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
        WHERE c.email IS NOT NULL
          AND b.service = ${service}
        ORDER BY c.email, b.created_at DESC
        LIMIT 100
      `;
    } else if (startDate) {
      patients = await sql`
        SELECT DISTINCT ON (c.email)
          c.id::text  AS id,
          c.full_name AS name,
          c.email,
          c.phone,
          b.service,
          b.created_at
        FROM contacts c
        INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
        WHERE c.email IS NOT NULL
          AND b.created_at >= ${startDate.toISOString()}
        ORDER BY c.email, b.created_at DESC
        LIMIT 100
      `;
    } else {
      patients = await sql`
        SELECT DISTINCT ON (c.email)
          c.id::text  AS id,
          c.full_name AS name,
          c.email,
          c.phone,
          b.service,
          b.created_at
        FROM contacts c
        INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
        WHERE c.email IS NOT NULL
        ORDER BY c.email, b.created_at DESC
        LIMIT 100
      `;
    }

    console.log('Patients found:', patients.length, '| service:', service, '| timeFilter:', timeFilter);
    return NextResponse.json(patients);

  } catch (error) {
    console.error('Error fetching patients:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
