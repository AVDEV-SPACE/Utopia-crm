import { resolveNicheTags, type OsmTag } from '@/services/leads/osm-categories';
import { osmUserAgent, sleep } from './http';
import { normalizeEmail, normalizeWebsite } from './normalize';
import type { EngineCandidate } from './types';

/**
 * Descoperire prin OpenStreetMap: Nominatim găsește granița orașului, Overpass
 * caută în ea firmele cu tag-ul nișei care au nume și site sau email.
 *
 * Politica instanțelor publice Overpass: ~10.000 cereri/zi, 429 la rate limit,
 * 504 la lipsă de resurse. Facem o singură interogare mică pe rulare
 * (o pereche nișă × oraș), cu fallback pe al doilea endpoint și backoff.
 */
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function overpassEndpoints(): string[] {
  const custom = process.env.OVERPASS_ENDPOINTS?.split(',').map((s) => s.trim()).filter(Boolean);
  return custom && custom.length > 0 ? custom : DEFAULT_ENDPOINTS;
}

/** Statusuri după care merită reîncercat (alt endpoint sau mai târziu). */
const RETRYABLE = new Set([429, 502, 503, 504]);

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

interface CityLocation {
  /** Id-ul de area Overpass (3600000000 + id-ul relației), dacă orașul are graniță */
  areaId: number | null;
  lat: number;
  lon: number;
}

const cityCache = new Map<string, CityLocation>();

async function nominatim(params: Record<string, string>): Promise<Array<Record<string, unknown>>> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('countrycodes', 'ro');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const contact = process.env.NOMINATIM_CONTACT_EMAIL;
  if (contact) url.searchParams.set('email', contact);

  const res = await fetch(url, {
    headers: { 'User-Agent': osmUserAgent() },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as Array<Record<string, unknown>>;
}

/** Granița administrativă a orașului (sau măcar centrul lui). */
export async function locateCity(city: string): Promise<CityLocation> {
  const cached = cityCache.get(city.toLowerCase());
  if (cached) return cached;

  const results = await nominatim({ city, limit: '5' });
  if (results.length === 0) throw new Error(`Nominatim nu a găsit orașul „${city}”`);

  const relation = results.find((r) => r.osm_type === 'relation');
  const first = relation ?? results[0];
  const location: CityLocation = {
    areaId: relation ? 3_600_000_000 + Number(relation.osm_id) : null,
    lat: Number(first.lat),
    lon: Number(first.lon),
  };
  cityCache.set(city.toLowerCase(), location);
  return location;
}

/** Site-ul unei firme după nume + oraș (folosit pentru paginile din Meta Ad Library). */
export async function findWebsiteByName(name: string, city: string): Promise<string | null> {
  const results = await nominatim({ q: `${name}, ${city}`, limit: '3', extratags: '1' });
  for (const result of results) {
    const extra = (result.extratags ?? {}) as Record<string, string>;
    const website = normalizeWebsite(extra.website ?? extra['contact:website']);
    if (website) return website;
  }
  return null;
}

function buildQuery(tags: OsmTag[], location: CityLocation): string {
  const scope = location.areaId ? '(area.a)' : `(around:10000,${location.lat},${location.lon})`;
  const contactKeys = ['website', 'contact:website', 'email', 'contact:email'];
  const clauses = tags
    .flatMap((t) => contactKeys.map((k) => `nwr["${t.key}"="${t.value}"]["name"]["${k}"]${scope};`))
    .join('');
  const area = location.areaId ? `area(id:${location.areaId})->.a;` : '';
  return `[out:json][timeout:50];${area}(${clauses});out center tags 100;`;
}

/**
 * Trimite interogarea cu fallback între endpoint-uri și backoff exponențial.
 * `deadline` (epoch ms) limitează tot efortul, ca funcția să încapă în maxDuration.
 */
async function runOverpass(query: string, deadline: number): Promise<OverpassElement[]> {
  const endpoints = overpassEndpoints();
  const failures: string[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const endpoint of endpoints) {
      const remaining = deadline - Date.now();
      if (remaining < 5_000) throw new Error(`Overpass: timp epuizat (${failures.join('; ')})`);

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': osmUserAgent() },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(Math.min(60_000, remaining)),
        });
        if (RETRYABLE.has(res.status)) {
          failures.push(`${new URL(endpoint).host} ${res.status}`);
          continue;
        }
        if (!res.ok) throw new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);

        const data = (await res.json()) as { elements?: OverpassElement[]; remark?: string };
        // Overpass întoarce 200 cu `remark` când interogarea a depășit timeout-ul
        if (data.remark && /runtime error|timed out|out of memory/i.test(data.remark)) {
          failures.push(`${new URL(endpoint).host}: ${data.remark.slice(0, 80)}`);
          continue;
        }
        return data.elements ?? [];
      } catch (err) {
        const name = (err as Error).name;
        if (name === 'TimeoutError' || name === 'AbortError' || (err as Error).message.includes('fetch failed')) {
          failures.push(`${new URL(endpoint).host} timeout`);
          continue;
        }
        throw err;
      }
    }
    await sleep(Math.min(2_000 * 2 ** attempt, Math.max(deadline - Date.now() - 5_000, 0)));
  }
  throw new Error(`Overpass indisponibil: ${failures.join('; ')}`);
}

/** Firmele unei nișe dintr-un oraș, cu nume și (site sau email). */
export async function discoverOsm(niche: string, city: string, deadline: number): Promise<EngineCandidate[]> {
  const tags = resolveNicheTags(niche);
  if (!tags) throw new Error(`Nișa „${niche}” nu are tag-uri OSM (src/services/leads/osm-categories.ts)`);

  const location = await locateCity(city);
  const elements = await runOverpass(buildQuery(tags, location), deadline);

  return elements
    .filter((el) => el.tags?.name)
    .map((el) => {
      const t = el.tags as Record<string, string>;
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
      return {
        name: t.name.trim(),
        website: normalizeWebsite(t.website ?? t['contact:website']),
        email: normalizeEmail(t.email ?? t['contact:email']),
        phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? null,
        address: street || null,
        niche,
        city,
        discovery: {
          source: 'openstreetmap',
          externalId: `${el.type}/${el.id}`,
          hasActiveMetaAds: false,
          metaPageId: null,
          facebook: t['contact:facebook'] ?? null,
          instagram: t['contact:instagram'] ?? null,
          linkedin: t['contact:linkedin'] ?? null,
        },
      } satisfies EngineCandidate;
    });
}
