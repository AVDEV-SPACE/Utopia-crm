// src/app/api/crm/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let isClosed = false;
  let previousIds = new Set<string | number>();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const initialData = await sql`SELECT id FROM crm_pack`;
        if (initialData) previousIds = new Set(initialData.map(r => r.id));

        const pollInterval = setInterval(async () => {
          if (isClosed) return clearInterval(pollInterval);
          const data = await sql`SELECT * FROM crm_pack ORDER BY created_at DESC LIMIT 100`;
          if (!data) return;

          const currentIds = new Set(data.map(r => r.id));
          data.forEach(reg => {
            if (!previousIds.has(reg.id)) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'update', event: 'INSERT', data: reg })}\n\n`));
            }
          });
          previousIds = currentIds;
        }, 4000);

        req.signal.addEventListener('abort', () => {
          isClosed = true;
          clearInterval(pollInterval);
          try { controller.close(); } catch (e) {}
        });
      } catch (e) { 
        if (!isClosed) controller.error(e); 
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}