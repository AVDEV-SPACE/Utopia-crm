import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizedUserId } from '@/lib/authorization';
import { createManualLead, findLeads, getLeadFacets } from '@/services/leads/repository';
import { getPitchSummaries } from '@/services/messages/repository';
import { getSettingsByApiKey } from '@/services/followups/settings';
import { processWebLead } from '@/services/followups/web-lead';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    // Ruta e publică în middleware (site-ul face POST fără sesiune Clerk),
    // deci citirea lead-urilor își verifică singură autentificarea.
    // Ruta e publică în middleware → autorizarea (allowlist) se verifică aici
    const userId = await authorizedUserId();
    if (!userId) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const param = (key: string) => searchParams.get(key)?.trim() || undefined;

    const limitParam = Number(searchParams.get('limit'));
    const offsetParam = Number(searchParams.get('offset'));

    // `rating`/`score` vin ca praguri ('4.5', '70') sau ca literalul 'none'
    const ratingParam = param('rating');
    const scoreParam = param('score');
    const asThreshold = (value: string | undefined) => {
      const n = Number(value);
      return value && value !== 'none' && Number.isFinite(n) ? n : undefined;
    };

    const { rows, total } = await findLeads({
      q: param('q'),
      source: param('source'),
      excludeSource: param('excludeSource'),
      niche: param('niche'),
      location: param('location'),
      category: param('category'),
      minRating: asThreshold(ratingParam),
      withoutRating: ratingParam === 'none',
      minScore: asThreshold(scoreParam),
      maxScore: asThreshold(param('scoreMax')),
      withoutScore: scoreParam === 'none',
      limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
      offset: Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0,
    });

    const headers = { 'Cache-Control': 'no-store, max-age=0' };

    // Forma bogată `{ leads, total }` e opt-in prin `?meta=1`, ca bara de căutare
    // din header și orice alt consumator existent să primească în continuare un
    // array simplu.
    if (searchParams.get('meta') === '1') {
      const facets = param('facets') === '1' ? await getLeadFacets(param('source')) : undefined;
      // Prin ce canale a fost deja contactat fiecare lead de pe pagina curentă.
      // O singură interogare peste id-urile returnate, nu una per rând.
      const pitched = await getPitchSummaries(rows.map((lead) => lead.id));
      return NextResponse.json({ leads: rows, total, facets, pitched }, { headers });
    }

    return NextResponse.json(rows, { headers });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Payload-ul trimis de formularele din agentie-digitala. */
const webLeadSchema = z.object({
  apiKey: z.string().min(1, 'apiKey este obligatoriu'),
  name: z.string().trim().min(1, 'name este obligatoriu').max(200),
  phone: z.string().trim().min(5, 'phone este obligatoriu').max(32),
  serviceDesired: z.string().trim().max(300).nullish(),
  email: z.string().trim().email().nullish(),
  sourceRef: z.string().trim().max(200).nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body JSON invalid' }, { status: 400 });
    }
    const raw = body as Record<string, unknown>;

    // ── Lead din site (autentificare prin API key) ──────────────────────────
    const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey : req.headers.get('x-api-key');

    if (apiKey) {
      const parsed = webLeadSchema.safeParse({ ...raw, apiKey });
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) },
          { status: 400 }
        );
      }

      const settings = await getSettingsByApiKey(parsed.data.apiKey);
      if (!settings) {
        return NextResponse.json({ error: 'API key invalid' }, { status: 401 });
      }

      const result = await processWebLead(settings, {
        name: parsed.data.name,
        phone: parsed.data.phone,
        serviceDesired: parsed.data.serviceDesired ?? null,
        email: parsed.data.email ?? null,
        sourceRef: parsed.data.sourceRef ?? null,
      });

      return NextResponse.json({
        success: true,
        leadId: result.lead?.id ?? null,
        duplicate: result.lead === null,
        smsSent: result.smsSent,
        ...(result.smsSkippedReason ? { smsSkippedReason: result.smsSkippedReason } : {}),
      });
    }

    // ── Lead adăugat manual din CRM (sesiune Clerk) ─────────────────────────
    // Ruta e publică în middleware → autorizarea (allowlist) se verifică aici
    const userId = await authorizedUserId();
    if (!userId) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { company_name, contact_email, contact_phone, niche, location } = raw as {
      company_name?: string;
      contact_email?: string;
      contact_phone?: string;
      niche?: string;
      location?: string;
    };

    if (!company_name) {
      return NextResponse.json({ error: 'Missing required field: company_name' }, { status: 400 });
    }
    if (!contact_email && !contact_phone) {
      return NextResponse.json(
        { error: 'Trebuie completat cel puțin contact_email sau contact_phone' },
        { status: 400 }
      );
    }

    const lead = await createManualLead({ company_name, contact_email, contact_phone, niche, location });
    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
