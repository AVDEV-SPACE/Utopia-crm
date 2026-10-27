import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPipelineKey } from '@/lib/pipeline-auth';
import { upsertPipelineLead } from '@/services/pipeline/repository';
import { normalizeStage } from '@/services/pipeline/stages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Text opțional: gol / doar spații → null. */
const text = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() || null : v ?? null),
    z.string().max(max).nullable()
  );

/** Număr opțional, acceptat și ca string („55"). */
const numberish = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().finite().nullable()
);

/** Email opțional. Unul malformat devine null, ca să nu respingem tot lead-ul. */
const looseEmail = z.preprocess((v) => {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase();
  return z.string().email().safeParse(email).success ? email : null;
}, z.string().nullable());

const flag = z.boolean().nullish();

/** Payload-ul de import — un lead per request. */
const pipelineLeadSchema = z.object({
  key: z.string({ error: 'key este obligatoriu' }).trim().min(1, 'key este obligatoriu').max(300),
  name: z.string({ error: 'name este obligatoriu' }).trim().min(1, 'name este obligatoriu').max(300),
  niche: text(200),
  city: text(200),
  address: text(500),
  phone: text(50),
  website: text(1000),
  email: looseEmail,
  emailSource: text(100),
  source: text(100),
  segment: text(10),
  icpScore: numberish,
  status: text(40),
  signals: z
    .object({ metaPixel: flag, googleAds: flag, activeOnSocial: flag, icpMatch: flag })
    .nullish(),
  audit: z.object({ issues: z.array(z.string().max(500)).max(50).nullish() }).nullish(),
  social: z.object({ instagram: text(300), facebook: text(300) }).nullish(),
  ai: z
    .object({
      subject: text(500),
      email_body: text(20000),
      linkedin_dm: text(5000),
      instagram_dm: text(5000),
      score_reason: text(5000),
    })
    .nullish(),
});

export async function POST(req: NextRequest) {
  const denied = checkPipelineKey(req);
  if (denied) return denied;

  const orgId = process.env.CRM_PIPELINE_ORG_ID?.trim();
  if (!orgId) {
    console.error('Pipeline: CRM_PIPELINE_ORG_ID nu este setat');
    return NextResponse.json(
      { error: 'CRM_PIPELINE_ORG_ID nu este setat pe server — lead-urile nu au un tenant' },
      { status: 500 }
    );
  }

  const body: unknown = await req.json().catch(() => undefined);
  if (body === undefined || body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body JSON invalid' }, { status: 400 });
  }

  const parsed = pipelineLeadSchema.safeParse(body);
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
    const result = await upsertPipelineLead(
      {
        key: data.key,
        name: data.name,
        niche: data.niche,
        city: data.city,
        address: data.address,
        phone: data.phone,
        website: data.website,
        email: data.email,
        emailSource: data.emailSource,
        source: data.source,
        segment: data.segment?.toUpperCase() ?? null,
        icpScore: data.icpScore,
        stage: normalizeStage(data.status),
        signals: data.signals ?? null,
        audit: data.audit ? { issues: data.audit.issues ?? [] } : null,
        social: data.social ?? null,
        ai: data.ai ?? null,
      },
      orgId
    );

    return NextResponse.json({
      id: result.id,
      key: result.key,
      stage: result.stage,
      created: result.created,
      skipOutreach: result.skipOutreach,
    });
  } catch (error) {
    console.error('Pipeline: upsert lead eșuat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
