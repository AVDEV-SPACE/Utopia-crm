import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { runOutreachPlan } from '@/services/outreach/plan';
import { getCampaignAudience } from '@/services/outreach/repository';
import { allowedRecipients, dailyCap } from '@/services/outreach/schedule';
import { getOutreachSettings } from '@/services/outreach/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Leaduri pe lot: fiecare poate cere un apel Groq (follow-up-uri AI), ~3–5s. */
const MAX_BATCH = 10;

const filtersSchema = z.object({
  niches: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  cities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  minScore: z.number().int().min(0).max(100).nullable().default(null),
  emailOnly: z.boolean().default(true),
});

/**
 * Campanie de outreach din /pipeline și /leads: publicul (leaduri nepitched,
 * filtrate după nișă, oraș, scor) și planificarea secvențelor pentru el.
 * POST cu `preview: true` → numărul de leaduri și opțiunile de filtrare;
 * altfel planifică un lot (clientul cheamă din nou până termină).
 */
const bodySchema = z.object({
  filters: filtersSchema,
  preview: z.boolean().default(false),
  limit: z.number().int().min(1).max(MAX_BATCH).default(MAX_BATCH),
  exclude: z.array(z.string().uuid()).max(500).default([]),
});

export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }

  const { filters, preview, limit, exclude } = parsed.data;
  try {
    if (preview) {
      const [audience, settings] = await Promise.all([getCampaignAudience(filters, allowedRecipients()), getOutreachSettings()]);
      return NextResponse.json({
        audience,
        testMode: allowedRecipients().length > 0,
        // Pasul 1 pe AI cere pitch-ul generat de enrich; cu template, orice lead cu email merge
        step1Template: settings.step1_template_id !== null,
        sendCap: dailyCap('email'),
      });
    }
    return NextResponse.json(await runOutreachPlan(50_000, { filters, limit, exclude }));
  } catch (error) {
    console.error('Campanie outreach eșuată:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
