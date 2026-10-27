import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPipelineKey } from '@/lib/pipeline-auth';
import { logPipelineEvent } from '@/services/pipeline/repository';
import { normalizeStage } from '@/services/pipeline/stages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Text opțional: gol / doar spații → null. */
const text = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || null : v ?? null),
    z.string().max(max).nullable()
  );

/** Un eveniment de outreach trimis de o unealtă externă — unul per request. */
const pipelineEventSchema = z
  .object({
    key: text(300),
    email: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim().toLowerCase() || null : v ?? null),
      z.string().max(320).nullable()
    ),
    channel: text(40),
    event: z.string({ error: 'event este obligatoriu' }).trim().min(1, 'event este obligatoriu').max(80),
    stage: text(40),
    campaignId: text(200),
    replyText: text(20000),
    at: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.string().datetime({ offset: true, message: 'at trebuie să fie o dată ISO 8601' }).optional()
    ),
    raw: z.unknown().optional(),
  })
  .refine((d) => d.key || d.email, { message: 'key sau email este obligatoriu', path: ['key'] });

export async function POST(req: NextRequest) {
  const denied = checkPipelineKey(req);
  if (denied) return denied;

  const body: unknown = await req.json().catch(() => undefined);
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body JSON invalid' }, { status: 400 });
  }

  const parsed = pipelineEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Date invalide',
        details: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
      },
      { status: 422 }
    );
  }

  const data = parsed.data;
  try {
    const result = await logPipelineEvent({
      key: data.key,
      email: data.email,
      channel: data.channel,
      event: data.event,
      stage: normalizeStage(data.stage),
      campaignId: data.campaignId,
      replyText: data.replyText,
      occurredAt: data.at ? new Date(data.at) : null,
      payload: data.raw,
    });

    return NextResponse.json({
      matched: result.matched,
      leadId: result.leadId,
      previousStage: result.previousStage,
      stage: result.stage,
    });
  } catch (error) {
    console.error('Pipeline: jurnalizarea evenimentului a eșuat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
