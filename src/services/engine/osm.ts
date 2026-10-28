import { normalizeNiche, resolveNicheTags, type OsmTag } from '@/services/leads/osm-categories';
import { osmUserAgent, sleep } from './http';
import { normalizeEmail, normalizeWebsite } from './normalize';
import type { EngineCandidate } from './types';

/**
 * Descoperire prin OpenStreetMap: Nominatim găsește granița orașului, Overpass
 * caută în ea firmele nișei care au nume și un contact (site, email sau telefon).
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

export interface CityLocation {
  /** Id-ul de area Overpass (3600000000 + id-ul relației), dacă orașul are graniță */
  areaId: number | null;
  lat: number;
  lon: number;
  /** Dreptunghiul localității (sau ~10 km în jurul centrului, fără graniță) */
  bbox: { south: number; north: number; west: number; east: number };
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

  let results = await nominatim({ city, limit: '5' });
  // Comunele și localitățile mici nu apar mereu ca `city`: căutare liberă
  if (results.length === 0) {
    await sleep(1_100); // Nominatim: max 1 cerere/secundă
    results = await nominatim({ q: city, limit: '5' });
  }
  if (results.length === 0) throw new Error(`Nominatim nu a găsit localitatea „${city}”`);

  const relation = results.find((r) => r.osm_type === 'relation');
  const first = relation ?? results[0];
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  // Nominatim: boundingbox = [sud, nord, vest, est]
  const box = relation && Array.isArray(relation.boundingbox) ? (relation.boundingbox as string[]).map(Number) : null;
  const location: CityLocation = {
    areaId: relation ? 3_600_000_000 + Number(relation.osm_id) : null,
    lat,
    lon,
    bbox:
      box && box.length === 4 && box.every(Number.isFinite)
        ? { south: box[0], north: box[1], west: box[2], east: box[3] }
        : { south: lat - 0.09, north: lat + 0.09, west: lon - 0.13, east: lon + 0.13 },
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

/**
 * Cum se caută o nișă în OSM — reuniunea celor două criterii:
 * - `tags`: tag-uri OSM, din dicționar sau scrise direct (ex. `amenity=veterinary`);
 * - `pattern`: căutare după nume printre locurile care sunt afaceri (au
 *   amenity/shop/office/...). Prinde și firmele etichetate greșit sau
 *   incomplet (ex. „Cabinet Veterinar X” pus ca magazin de animale).
 * Un tag scris direct caută doar tag-ul.
 */
export interface NicheMatch {
  tags: OsmTag[];
  pattern: string | null;
}

/** Tag OSM scris direct: `cheie=valoare`, doar caractere sigure în interogare. */
const EXPLICIT_TAG = /^([a-z_:]+)=([a-z0-9_]+)$/;

/** Cheile care marchează un loc ca afacere, la căutarea după nume. */
const BUSINESS_KEYS = ['amenity', 'shop', 'office', 'craft', 'healthcare', 'tourism', 'leisure'];

/** Oricare dintre aceste chei = firma are un contact (site, email, telefon sau social). */
const CONTACT_FILTER =
  '[~"^(website|contact:website|email|contact:email|phone|contact:phone|contact:mobile|contact:facebook|contact:instagram|facebook|instagram)$"~"."]';

/**
 * Litera fără diacritice → toate variantele ei. Alternanțe, nu clase: în
 * clasele POSIX caracterele pe mai mulți octeți nu se potrivesc sigur, iar
 * `,i` nu acoperă majusculele cu diacritice.
 */
const DIACRITICS: Record<string, string> = {
  a: '(a|ă|â|A|Ă|Â)',
  i: '(i|î|I|Î)',
  s: '(s|ș|ş|S|Ș|Ş)',
  t: '(t|ț|ţ|T|Ț|Ţ)',
};

/** Traduce nișa în criteriul de căutare; `null` = text prea scurt ca să caute ceva util. */
export function resolveNiche(niche: string): NicheMatch | null {
  const explicit = EXPLICIT_TAG.exec(niche.trim().toLowerCase());
  if (explicit) return { tags: [{ key: explicit[1], value: explicit[2] }], pattern: null };

  const tags = resolveNicheTags(niche) ?? [];
  // Doar litere, cifre și spații ajung în regex — nimic nu poate ieși din ghilimele
  const words = normalizeNiche(niche).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const pattern =
    words.join('').length >= 3
      ? words.map((w) => [...w].map((ch) => DIACRITICS[ch] ?? ch).join('')).join('[ -]+')
      : null;

  if (tags.length === 0 && !pattern) return null;
  return { tags, pattern };
}

function buildQuery(match: NicheMatch, location: CityLocation): string {
  const scope = location.areaId ? '(area.a)' : `(around:10000,${location.lat},${location.lon})`;
  const clauses = [
    ...match.tags.map((t) => `nwr["${t.key}"="${t.value}"]["name"]${CONTACT_FILTER}${scope};`),
    ...(match.pattern
      ? BUSINESS_KEYS.map((k) => `nwr["${k}"]["name"~"${match.pattern}",i]${CONTACT_FILTER}${scope};`)
      : []),
  ];
  const area = location.areaId ? `area(id:${location.areaId})->.a;` : '';
  // `out` fără număr: toate rezultatele, fără plafon
  return `[out:json][timeout:90];${area}(${clauses.join('')});out center tags;`;
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

/** Firmele unei nișe dintr-un oraș, cu nume și un contact (site, email sau telefon). */
export async function discoverOsm(niche: string, city: string, deadline: number): Promise<EngineCandidate[]> {
  const match = resolveNiche(niche);
  if (!match) throw new Error(`Nișa „${niche}” e prea scurtă pentru căutare (minim 3 litere)`);

  const location = await locateCity(city);
  const elements = await runOverpass(buildQuery(match, location), deadline);

  return elements
    // Lanțurile naționale (au brand) nu sunt firme locale
    .filter((el) => el.tags?.name && !el.tags.brand && !el.tags['brand:wikidata'])
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
          facebook: t['contact:facebook'] ?? t.facebook ?? null,
          instagram: t['contact:instagram'] ?? t.instagram ?? null,
          linkedin: t['contact:linkedin'] ?? null,
        },
      } satisfies EngineCandidate;
    });
}
