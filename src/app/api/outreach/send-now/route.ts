import { NextRequest, NextResponse } from 'next/server';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { runOutreachSend } from '@/services/outreach/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * „Trimite acum”: o rulare a jobului outreach-send, la cerere — aceleași
 * reguli (luni–vineri 09–17, plafonul zilnic, maximum 2 emailuri pe rulare).
 */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    return NextResponse.json(await runOutreachSend(req.nextUrl.origin));
  } catch (error) {
    console.error('Trimiterea manuală outreach a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
