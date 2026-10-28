import { sleep } from './http';
import { findWebsiteByName } from './osm';
import type { EngineCandidate } from './types';

/**
 * Meta Ad Library API (gratuit) — opțional, rulează doar cu META_ADLIB_TOKEN.
 *
 * `ads_archive` cu `ad_type=ALL` întoarce și reclamele comerciale, dar doar pe
 * cele livrate în UE (DSA) — România e inclusă. Tokenul cere confirmarea
 * identității la facebook.com/ID pentru contul care deține aplicația.
 * Pagina unei firme cu reclame active = segment A garantat.
 */
const MAX_PAGES_PER_RUN = 10;

interface ArchivedAd {
  page_id?: string;
  page_name?: string;
}

export function isMetaAdLibraryEnabled(): boolean {
  return Boolean(process.env.META_ADLIB_TOKEN);
}

export async function discoverMetaAds(niche: string, city: string, deadline: number): Promise<EngineCandidate[]> {
  const token = process.env.META_ADLIB_TOKEN;
  if (!token) return [];

  const version = process.env.META_GRAPH_VERSION || 'v26.0';
  const url = new URL(`https://graph.facebook.com/${version}/ads_archive`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('ad_reached_countries', JSON.stringify(['RO']));
  url.searchParams.set('ad_type', 'ALL');
  url.searchParams.set('ad_active_status', 'ACTIVE');
  url.searchParams.set('search_terms', `${niche} ${city}`.slice(0, 100));
  url.searchParams.set('fields', 'page_id,page_name');
  url.searchParams.set('limit', '100');

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as { data?: ArchivedAd[]; error?: { message?: string; code?: number } };
  if (!res.ok) {
    // Mesajul Meta nu conține tokenul; îl păstrăm pentru diagnostic
    throw new Error(`Meta Ad Library ${res.status}: ${data.error?.message ?? 'eroare necunoscută'}`);
  }

  const pages = new Map<string, string>();
  for (const ad of data.data ?? []) {
    if (ad.page_id && ad.page_name && !pages.has(ad.page_id)) pages.set(ad.page_id, ad.page_name.trim());
  }

  const candidates: EngineCandidate[] = [];
  for (const [pageId, pageName] of [...pages].slice(0, MAX_PAGES_PER_RUN)) {
    if (deadline - Date.now() < 10_000) break;
    // Site-ul după nume + oraș; Nominatim cere maximum 1 cerere/secundă
    const website = await findWebsiteByName(pageName, city).catch(() => null);
    await sleep(1_100);

    candidates.push({
      name: pageName,
      website,
      email: null,
      phone: null,
      address: null,
      niche,
      city,
      discovery: {
        source: 'meta_ad_library',
        externalId: pageId,
        hasActiveMetaAds: true,
        metaPageId: pageId,
        facebook: `https://www.facebook.com/${pageId}`,
        instagram: null,
        linkedin: null,
      },
    });
  }
  return candidates;
}
