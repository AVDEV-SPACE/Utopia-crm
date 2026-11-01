import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant';
import { getLeadTimeline } from '@/services/leads/timeline';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Conversația lead-ului pe toate canalele + evenimentele din pipeline (tab-ul „Istoric”). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    const items = await getLeadTimeline(id);
    return NextResponse.json(items, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Istoricul lead-ului a eșuat:', error);
    return NextResponse.json({ error: 'Nu am putut încărca conversația' }, { status: 500 });
  }
}
