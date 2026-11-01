import { NextRequest, NextResponse } from 'next/server';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { runInboxSync } from '@/services/outreach/inbox';
import type { InboxSyncResult } from '@/services/outreach/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Verificările automate (paginile deschise) nu lovesc Gmail mai des de atât. */
const AUTO_MIN_INTERVAL_MS = 60_000;

let lastRunAt = 0;
/** Rularea în curs: o cerere suprapusă o așteaptă, ca un răspuns să nu fie procesat de două ori. */
let running: Promise<InboxSyncResult> | null = null;

/**
 * „Verifică răspunsurile acum” (fișa lead-ului, lead-ul de test): aceeași rulare
 * ca jobul inbox-sync, la cerere, fără să aștepți programarea. `?auto=1` vine
 * de la /leads și /pipeline cât timp sunt deschise și respectă limita de frecvență.
 */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const auto = req.nextUrl.searchParams.get('auto') === '1';
  if (running) return NextResponse.json(await running.catch(() => ({ skipped: true })));
  if (auto && Date.now() - lastRunAt < AUTO_MIN_INTERVAL_MS) return NextResponse.json({ skipped: true });

  lastRunAt = Date.now();
  running = runInboxSync(50_000);
  try {
    return NextResponse.json(await running);
  } catch (error) {
    console.error('Verificarea răspunsurilor a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  } finally {
    running = null;
  }
}
