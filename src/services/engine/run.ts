import { discoverOsm } from './osm';
import { discoverMetaAds, isMetaAdLibraryEnabled } from './meta-adlib';
import { discoverGooglePlaces, isGooglePlacesEnabled } from './google-places';
import { enrichLead, snapshotSite, type SiteSnapshot } from './enrich';
import { mapLimit } from './http';
import {
  claimQueue,
  countNewToday,
  effectiveMaxNewPerDay,
  finishRun,
  getEngineSettings,
  insertCandidates,
  nextDiscoverPair,
  releaseClaims,
  saveEnrichment,
  startRun,
} from './repository';
import type { DiscoverResult, EngineCandidate, EnrichResult } from './types';

/**
 * Bugetul de timp al unei rulări. Vercel Hobby (Fluid compute) permite
 * maxDuration 300s; ne oprim mai devreme ca să apucăm să scriem rezultatul.
 * Fără Fluid compute limita e 60s → setează ENGINE_TIME_BUDGET_MS=50000.
 */
function timeBudgetMs(): number {
  const fromEnv = Number(process.env.ENGINE_TIME_BUDGET_MS);
  return Number.isFinite(fromEnv) && fromEnv >= 20_000 ? Math.min(fromEnv, 280_000) : 240_000;
}

/** Tenant-ul lead-urilor motorului (același ca la importul generic). */
export function engineOrgId(): string {
  const orgId = process.env.CRM_PIPELINE_ORG_ID?.trim();
  if (!orgId) throw new Error('CRM_PIPELINE_ORG_ID nu este setat — lead-urile nu au un tenant');
  return orgId;
}

/** O rulare de descoperire: o singură pereche nișă × oraș. */
export async function runDiscover(trigger: 'cron' | 'manual'): Promise<DiscoverResult> {
  const deadline = Date.now() + timeBudgetMs();
  const orgId = engineOrgId();
  const runId = await startRun('discover', trigger);
  const errors: string[] = [];

  const settings = await getEngineSettings();
  const remaining = effectiveMaxNewPerDay(settings) - (await countNewToday());
  if (remaining <= 0) {
    const skipped = 'plafonul zilnic de lead-uri noi a fost atins';
    await finishRun(runId, { errors: [skipped] });
    return { runId, niche: null, city: null, found: 0, inserted: 0, duplicates: 0, errors: [skipped], skipped };
  }

  const pair = await nextDiscoverPair();
  if (!pair) {
    const skipped = 'nicio nișă sau niciun oraș configurat';
    await finishRun(runId, { errors: [skipped] });
    return { runId, niche: null, city: null, found: 0, inserted: 0, duplicates: 0, errors: [skipped], skipped };
  }

  const candidates: EngineCandidate[] = [];
  const collect = async (label: string, task: () => Promise<EngineCandidate[]>) => {
    try {
      candidates.push(...(await task()));
    } catch (err) {
      errors.push(`${label}: ${(err as Error).message}`);
    }
  };

  // Sursele rulează pe rând: Nominatim (folosit de OSM și Meta) cere max 1 req/s
  await collect('OSM', () => discoverOsm(pair.niche, pair.city, deadline));
  if (isMetaAdLibraryEnabled()) await collect('Meta Ad Library', () => discoverMetaAds(pair.niche, pair.city, deadline));
  if (isGooglePlacesEnabled()) await collect('Google Places', () => discoverGooglePlaces(pair.niche, pair.city));

  const result = await insertCandidates(candidates, { orgId, source: 'engine', limit: remaining });
  if (result.overCap > 0) errors.push(`${result.overCap} candidați amânați: plafon zilnic atins`);

  await finishRun(runId, { found: candidates.length, inserted: result.inserted, errors, params: pair });
  return {
    runId,
    niche: pair.niche,
    city: pair.city,
    found: candidates.length,
    inserted: result.inserted,
    duplicates: result.duplicates,
    errors,
  };
}

/** O rulare de îmbogățire: cel mult `enrich_batch` lead-uri din coadă. */
export async function runEnrich(trigger: 'cron' | 'manual'): Promise<EnrichResult> {
  const deadline = Date.now() + timeBudgetMs();
  const runId = await startRun('enrich', trigger);
  const settings = await getEngineSettings();
  const errors: string[] = [];
  const done: EnrichResult['leads'] = [];

  const leads = await claimQueue(settings.enrich_batch);

  // Site-urile se descarcă în paralel (I/O); AI-ul merge secvențial, ca să
  // rămână sub plafonul de tokeni/minut al Groq free tier.
  const snapshots: SiteSnapshot[] = await mapLimit(leads, 4, (lead) => snapshotSite(lead.website));

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (deadline - Date.now() < 25_000) {
      errors.push(`timp epuizat: ${leads.length - i} lead-uri rămân în coadă`);
      await releaseClaims(leads.slice(i).map((l) => l.id));
      break;
    }

    try {
      const update = await enrichLead(lead, snapshots[i], { minScore: settings.min_score, deadline });
      if (update.aiError) errors.push(`${lead.company_name}: ${update.aiError}`);
      const stage = await saveEnrichment(lead, update);
      if (stage) done.push({ id: lead.id, name: lead.company_name, stage });
      else errors.push(`${lead.company_name}: etapa s-a schimbat între timp, nu am suprascris`);
    } catch (err) {
      if ((err as Error).name === 'GroqRateLimitError') {
        // Plafonul Groq: lead-urile rămase revin în coadă fără să consume încercări
        errors.push((err as Error).message);
        await releaseClaims(leads.slice(i).map((l) => l.id));
        break;
      }
      errors.push(`${lead.company_name}: ${(err as Error).message}`);
      await releaseClaims([lead.id]);
    }
  }

  await finishRun(runId, { found: leads.length, processed: done.length, errors });
  return { runId, processed: done.length, leads: done, errors };
}
