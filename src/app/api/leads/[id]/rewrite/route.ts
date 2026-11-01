import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant';
import { GroqRateLimitError } from '@/services/engine/groq';
import { getLeadById } from '@/services/leads/repository';
import { rewriteMessage } from '@/services/outreach/ai';
import { DIRECT_CHANNELS } from '@/services/outreach/channels';
import { htmlToText, isHtmlContent } from '@/services/outreach/render';
import type { PipelineScoreDetails } from '@/services/pipeline/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  channel: z.enum(DIRECT_CHANNELS as [string, ...string[]]),
  subject: z.string().trim().max(300).nullish(),
  body: z.string().trim().min(1, 'Mesajul e gol').max(20_000),
  instruction: z.string().trim().min(3, 'Scrie ce vrei să schimbe AI-ul').max(500),
});

/**
 * „Ajustează cu AI” din fișa lead-ului: Groq rescrie mesajul după instrucțiune,
 * folosind doar faptele verificate ale lead-ului (semnale, audit, social).
 * Nu salvează nimic — rezultatul revine în compozitor, unde se poate edita.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }

  try {
    const lead = await getLeadById(params.id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    const details = (lead.score_details ?? null) as unknown as Partial<PipelineScoreDetails> | null;
    const signals = details?.signals ?? {};
    const facts = {
      firma: lead.company_name,
      nisa: lead.niche,
      oras: lead.location,
      site: lead.website,
      probleme_audit: details?.audit?.issues ?? [],
      // Doar semnalele adevărate: absența unui semnal nu e un fapt
      semnale_prezente: Object.entries(signals)
        .filter(([, v]) => v === true)
        .map(([k]) => k),
      social: { instagram: Boolean(lead.contact_instagram ?? details?.social?.instagram), facebook: Boolean(details?.social?.facebook) },
    };

    // HTML-ul (template-urile cu design) se ajustează ca text: AI-ul nu rescrie markup
    const { channel, subject, body, instruction } = parsed.data;
    const wasHtml = isHtmlContent(body);
    const result = await rewriteMessage(
      { channel, subject: subject ?? null, body: wasHtml ? htmlToText(body) : body, instruction, facts },
      Date.now() + 45_000
    );
    return NextResponse.json({ ...result, convertedFromHtml: wasHtml });
  } catch (error) {
    if (error instanceof GroqRateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error('Ajustare AI eșuată:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
