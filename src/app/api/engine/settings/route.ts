import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { resolveNiche } from '@/services/engine/osm';
import {
  getEngineSettings,
  getEngineStats,
  listRuns,
  updateEngineSettings,
} from '@/services/engine/repository';
import { isMetaAdLibraryEnabled } from '@/services/engine/meta-adlib';
import { isGooglePlacesEnabled } from '@/services/engine/google-places';
import { isOvertureEnabled } from '@/services/engine/overture';
import { groqModel } from '@/services/engine/groq';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Panoul „Motor leaduri”: setări, statistici, ultimele rulări, surse active. */
export async function GET() {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    const [settings, stats, runs] = await Promise.all([getEngineSettings(), getEngineStats(), listRuns(10)]);
    return NextResponse.json(
      {
        settings,
        stats,
        runs,
        sources: {
          osm: true,
          metaAdLibrary: isMetaAdLibraryEnabled(),
          googlePlaces: isGooglePlacesEnabled(),
          overture: isOvertureEnabled(),
        },
        model: groqModel(),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Motor: citirea setărilor a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

const list = (max: number) =>
  z
    .array(z.string().trim().min(1).max(80))
    .max(max)
    .transform((values) => [...new Set(values)]);

const patchSchema = z.object({
  niches: list(40).optional(),
  cities: list(40).optional(),
  max_new_per_day: z.number().int().min(0).max(2000).nullable().optional(),
  enrich_batch: z.number().int().min(1).max(20).optional(),
  min_score: z.number().int().min(0).max(100).optional(),
});

export async function PUT(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Date invalide', details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      { status: 400 }
    );
  }

  // Orice nișă se poate căuta (dicționar, tag OSM sau după nume); doar textul
  // prea scurt ar face fiecare rulare pe ea să eșueze
  const unusable = (parsed.data.niches ?? []).filter((n) => !resolveNiche(n));
  if (unusable.length > 0) {
    return NextResponse.json(
      { error: `Nișe prea scurte pentru căutare (minim 3 litere): ${unusable.join(', ')}`, details: unusable },
      { status: 400 }
    );
  }

  try {
    const settings = await updateEngineSettings(parsed.data);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Motor: salvarea setărilor a eșuat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
