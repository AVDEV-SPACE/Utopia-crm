import { NextRequest, NextResponse } from 'next/server';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { listPipelineLeads } from '@/services/pipeline/repository';
import { normalizeStage } from '@/services/pipeline/stages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * Lista din /pipeline (filtre + paginare + KPI). Ruta NU e publică: o protejează
 * middleware-ul (Clerk + allowlist), iar handler-ul cere în plus rolul owner.
 */
export async function GET(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    const { searchParams } = new URL(req.url);
    const param = (key: string) => searchParams.get(key)?.trim() || undefined;
    const limit = Number(searchParams.get('limit'));
    const offset = Number(searchParams.get('offset'));
    const icp = param('icp');

    const page = await listPipelineLeads({
      q: param('q'),
      stage: normalizeStage(param('stage')) ?? undefined,
      segment: param('segment'),
      city: param('city'),
      icp: icp === '1' ? true : icp === '0' ? false : undefined,
      sort: param('sort') === 'score' ? 'score' : 'date',
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
    });

    return NextResponse.json(
      { leads: page.rows, total: page.total, kpi: page.kpi, facets: page.facets },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Pipeline: listarea a eșuat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
