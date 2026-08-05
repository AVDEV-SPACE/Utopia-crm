import { NextRequest, NextResponse } from 'next/server';
import { searchPlaces } from '@/services/leads/places';
import { scanWebsite } from '@/services/leads/site-scan';
import { getPageSpeedScores } from '@/services/leads/pagespeed';
import { computeScore } from '@/services/leads/scoring';
import { insertLead } from '@/services/leads/repository';
import { tryAcquireRateLimit } from '@/services/leads/rate-limit';
import { Lead } from '@/services/leads/types';

export const dynamic = 'force-dynamic';

const SCAN_RATE_LIMIT_MS = 10_000;

export async function POST(req: NextRequest) {
  try {
    const allowed = await tryAcquireRateLimit('leads-scan', SCAN_RATE_LIMIT_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Prea multe cereri — încearcă din nou peste câteva secunde (max 1 scanare / 10s).' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { niche, location, radius_km } = body as {
      niche?: string;
      location?: string;
      radius_km?: number;
    };

    if (!niche || !location) {
      return NextResponse.json({ error: 'niche și location sunt obligatorii' }, { status: 400 });
    }

    const places = await searchPlaces(niche, location, radius_km ?? 10);
    const withWebsite = places.filter((p) => p.website);

    const results = await Promise.allSettled(
      withWebsite.map(async (place): Promise<Lead> => {
        const website = place.website as string;
        const [scan, pagespeed] = await Promise.all([scanWebsite(website), getPageSpeedScores(website)]);
        const { score, score_details } = computeScore(scan, pagespeed);

        return insertLead({
          company_name: place.companyName,
          website,
          niche,
          location,
          score,
          score_details,
          contact_phone: place.phone,
          contact_email: place.email,
        });
      })
    );

    const leads = results
      .filter((r): r is PromiseFulfilledResult<Lead> => r.status === 'fulfilled')
      .map((r) => r.value);
    const failedCount = results.length - leads.length;

    return NextResponse.json({
      leads,
      scanned: places.length,
      skipped_no_website: places.length - withWebsite.length,
      failed: failedCount,
    });
  } catch (error) {
    console.error('Error scanning leads:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
