import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      usersResult,
      bookingsMetrics,
      chatMetrics,
      dailyResult,
      serviceResult,
      allBookings,
    ] = await Promise.all([
      // Echipa CRM — pentru OverviewStats (backward compat)
      sql`SELECT id, role FROM crm_users`,

      // Metrici bookings
      sql`
        SELECT
          COUNT(*)                                                                       AS total,
          COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))               AS this_month,
          COUNT(*) FILTER (WHERE meeting_date = CURRENT_DATE)                            AS today
        FROM bookings
      `,

      // Metrici ChatWidget
      sql`
        SELECT
          COUNT(*)                                                                       AS total,
          COUNT(*) FILTER (WHERE started_at >= date_trunc('month', NOW()))               AS this_month
        FROM chat_sessions
      `,

      // Trend zilnic — ultimele 30 zile
      sql`
        SELECT
          meeting_date::text AS date,
          COUNT(*)           AS count
        FROM bookings
        WHERE meeting_date >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY meeting_date
        ORDER BY meeting_date
      `,

      // Distribuție servicii
      sql`
        SELECT
          service,
          COUNT(*) AS count
        FROM bookings
        WHERE service IS NOT NULL
        GROUP BY service
        ORDER BY count DESC
      `,

      // Toate bookingurile — pentru OverviewStats (backward compat)
      sql`
        SELECT
          id::text, name, email,
          meeting_date, meeting_time,
          service, status, created_at
        FROM bookings
        ORDER BY created_at DESC
      `,
    ]);

    const bm = bookingsMetrics[0] ?? {};
    const cm = chatMetrics[0]    ?? {};

    return NextResponse.json({
      // Backward compat pentru OverviewStats component
      users:    usersResult,
      bookings: allBookings,

      // Metrici îmbogățite pentru noul dashboard
      metrics: {
        bookingsTotal:          Number(bm.total        ?? 0),
        bookingsThisMonth:      Number(bm.this_month   ?? 0),
        bookingsToday:          Number(bm.today        ?? 0),
        chatSessionsTotal:      Number(cm.total        ?? 0),
        chatSessionsThisMonth:  Number(cm.this_month   ?? 0),
      },

      dailyData:   dailyResult.map(r  => ({ date: String(r.date),      count: Number(r.count) })),
      serviceData: serviceResult.map(r => ({ service: String(r.service), count: Number(r.count) })),
    });

  } catch (error) {
    console.error('Error fetching overview data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
