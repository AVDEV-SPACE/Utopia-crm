import { NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { authorizedUserId } from '@/lib/authorization';
import { getTenantContext } from '@/lib/tenant';
import type { NavBadges } from '@/lib/navConfig';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Numărătorile din sidebar. Fiecare interogare e independentă: dacă una
 * eșuează (ex. tabel lipsă într-un mediu nou), badge-ul ei lipsește, nu tot
 * răspunsul.
 *  - leadsNew           lead-uri încă neprocesate (status `new`)
 *  - followupsAwaiting  conversații WhatsApp/SMS în care ultimul mesaj e al contactului
 *  - socialsAwaiting    la fel, pentru DM-urile Facebook/Instagram
 */
export async function GET() {
  const userId = await authorizedUserId();
  if (!userId) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });
  const tenant = await getTenantContext();

  const count = async (query: Promise<unknown>): Promise<number | undefined> => {
    try {
      const rows = (await query) as { n: string | number }[];
      return Number(rows[0]?.n ?? 0);
    } catch (err) {
      console.error('[nav/badges]', err);
      return undefined;
    }
  };

  const awaiting = (social: boolean) =>
    tenant
      ? sql`
          SELECT COUNT(*) AS n
          FROM conversations c
          WHERE c.org_id = ${tenant.orgId}
            AND (c.channel IN ('facebook', 'instagram', 'linkedin')) = ${social}
            AND (
              SELECT m.role FROM conversation_messages m
              WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC LIMIT 1
            ) = 'user'
        `
      : Promise.resolve([{ n: 0 }]);

  const [leadsNew, followupsAwaiting, socialsAwaiting] = await Promise.all([
    count(sql`SELECT COUNT(*) AS n FROM leads WHERE status = 'new'`),
    count(awaiting(false)),
    count(awaiting(true)),
  ]);

  const badges: NavBadges = { leadsNew, followupsAwaiting, socialsAwaiting };
  return NextResponse.json(badges, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
