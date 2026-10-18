import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { listConversations } from '@/services/followups/conversations';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET() {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const conversations = await listConversations(tenant.orgId);
    return NextResponse.json(conversations, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[followups/conversations] GET error:', error);
    return NextResponse.json({ error: 'Nu am putut încărca conversațiile' }, { status: 500 });
  }
}
