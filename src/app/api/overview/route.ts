import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';

export const dynamic = 'force-dynamic';

/**
 * Perioadele graficului „Activitate” (`?activity=`). Fiecare bară e o zi, o săptămână
 * (luni–duminică) sau o lună calendaristică; ultima bară e cea curentă, încă în desfășurare.
 */
const ACTIVITY = {
  '7d':  { unit: 'day',   step: '1 day',   span: '6 days'    },
  '14d': { unit: 'day',   step: '1 day',   span: '13 days'   },
  '30d': { unit: 'day',   step: '1 day',   span: '29 days'   },
  '12w': { unit: 'week',  step: '1 week',  span: '11 weeks'  },
  '12m': { unit: 'month', step: '1 month', span: '11 months' },
} as const;

type ActivityPeriod = keyof typeof ACTIVITY;

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get('activity');
  const activityPeriod: ActivityPeriod = param && param in ACTIVITY ? (param as ActivityPeriod) : '14d';
  const act = ACTIVITY[activityPeriod];

  try {
    const [
      usersResult,
      bookingsMetrics,
      chatMetrics,
      dailyResult,
      serviceResult,
      allBookings,
      pitchedResult,
      pitchedTrendResult,
      activityResult,
      todayResult,
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

      // Metrici ChatWidget — doar sesiunile în care userul a scris (widget-ul creează sesiuni goale la fiecare încărcare)
      sql`
        SELECT
          COUNT(*)                                                                       AS total,
          COUNT(*) FILTER (WHERE started_at >= date_trunc('month', NOW()))               AS this_month
        FROM chat_sessions cs
        WHERE EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.session_id = cs.session_id AND cm.role = 'user')
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

      // Lead-uri cărora li s-a trimis un pitch. Tabelele de lead-uri sunt opționale
      // (setup separat), deci lipsa lor nu trebuie să blocheze restul paginii.
      sql`
        SELECT
          COUNT(DISTINCT lead_id)                                                                AS total,
          COUNT(DISTINCT lead_id) FILTER (WHERE created_at >= date_trunc('month', NOW()))        AS this_month,
          COUNT(DISTINCT lead_id) FILTER (
            WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
              AND created_at <  NOW() - INTERVAL '1 month'
          )                                                                                      AS last_month,
          COUNT(*)                                                                               AS messages,
          (SELECT COUNT(*) FROM leads)                                                           AS leads_total
        FROM sent_messages
        WHERE recipient_type = 'lead' AND status = 'sent' AND lead_id IS NOT NULL
      `.catch(err => { console.error('Overview pitched error:', err); return []; }),

      // Lead-uri pitch-uite cumulat, pe ultimele 30 de zile — pentru sparkline
      sql`
        WITH firsts AS (
          SELECT lead_id, MIN(created_at)::date AS d
          FROM sent_messages
          WHERE recipient_type = 'lead' AND status = 'sent' AND lead_id IS NOT NULL
          GROUP BY lead_id
        )
        SELECT
          g::date::text                                     AS date,
          (SELECT COUNT(*) FROM firsts WHERE d <= g::date)  AS cumulative
        FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day') AS g
        ORDER BY g
      `.catch(() => []),

      // Activitate pe perioada aleasă: bookings create vs. sesiuni de chat, pe intervale
      sql`
        WITH buckets AS (
          SELECT g::date AS start, (g + ${act.step}::interval)::date AS stop
          FROM generate_series(
            date_trunc(${act.unit}, CURRENT_DATE::timestamp) - ${act.span}::interval,
            date_trunc(${act.unit}, CURRENT_DATE::timestamp),
            ${act.step}::interval
          ) AS g
        )
        SELECT
          b.start::text AS date,
          (SELECT COUNT(*) FROM bookings WHERE created_at >= b.start AND created_at < b.stop) AS bookings,
          (SELECT COUNT(*) FROM chat_sessions cs
            WHERE cs.started_at >= b.start AND cs.started_at < b.stop
              AND EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.session_id = cs.session_id AND cm.role = 'user')) AS chats
        FROM buckets b
        ORDER BY b.start
      `,

      // Programările de azi, în ordinea orei
      sql`
        SELECT id::text, name, email, meeting_time, service, status
        FROM bookings
        WHERE meeting_date = CURRENT_DATE
        ORDER BY meeting_time
      `,
    ]);

    const bm = bookingsMetrics[0] ?? {};
    const cm = chatMetrics[0]    ?? {};
    const pt = pitchedResult[0]  ?? {};

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

      pitched: {
        total:      Number(pt.total       ?? 0),
        thisMonth:  Number(pt.this_month  ?? 0),
        lastMonth:  Number(pt.last_month  ?? 0),
        messages:   Number(pt.messages    ?? 0),
        leadsTotal: Number(pt.leads_total ?? 0),
      },
      pitchedTrend: pitchedTrendResult.map(r => Number(r.cumulative)),
      activityPeriod,
      activityBucket: act.unit,
      activity: activityResult.map(r => ({
        date:     String(r.date),
        bookings: Number(r.bookings),
        chats:    Number(r.chats),
      })),
      today: todayResult.map(r => ({
        id:     String(r.id),
        name:   String(r.name ?? ''),
        email:  String(r.email ?? ''),
        time:   String(r.meeting_time ?? ''),
        service: r.service ? String(r.service) : null,
        status: String(r.status ?? 'pending'),
      })),
    });

  } catch (error) {
    console.error('Error fetching overview data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
