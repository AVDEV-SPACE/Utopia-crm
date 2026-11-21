// src/app/api/health/live/route.ts — procesul răspunde (vezi lib/health.ts)

import { appVersion } from '@/lib/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'pass', ...appVersion('utopia-crm') }, { headers: { 'Cache-Control': 'no-store' } });
}
