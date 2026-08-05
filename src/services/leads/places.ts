import { resolveNicheTags } from './osm-categories';

export interface PlaceResult {
  placeId: string;
  companyName: string;
  website: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

interface OsmTags {
  name?: string;
  website?: string;
  'contact:website'?: string;
  phone?: string;
  'contact:phone'?: string;
  email?: string;
  'contact:email'?: string;
  'addr:street'?: string;
  'addr:housenumber'?: string;
  'addr:city'?: string;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
}

function userAgent(): string {
  const contact = process.env.NOMINATIM_CONTACT_EMAIL;
  return `UtopiaCRM-LeadGen/1.0 (${contact ?? 'contact via UTOPIA_SITE_URL'})`;
}

/**
 * Nominatim (geocodare) — folosit DOAR ca să transformăm numele locației
 * într-o coordonată. Nominatim NU face full-text search pe categorie de
 * business (e un geocoder, potrivește doar nume/adrese literale + câteva
 * "special phrases" în engleză) — de-asta categoria/nișa se caută separat,
 * prin Overpass, pe tag-uri OSM reale.
 */
async function geocodeLocation(location: string): Promise<{ lat: number; lon: number } | null> {
  const endpoint = new URL('https://nominatim.openstreetmap.org/search');
  endpoint.searchParams.set('q', location);
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('limit', '1');
  const contact = process.env.NOMINATIM_CONTACT_EMAIL;
  if (contact) endpoint.searchParams.set('email', contact);

  const res = await fetch(endpoint.toString(), { headers: { 'User-Agent': userAgent() } });
  if (!res.ok) return null;

  const results = (await res.json()) as { lat: string; lon: string }[];
  const first = results[0];
  return first ? { lat: parseFloat(first.lat), lon: parseFloat(first.lon) } : null;
}

function buildOverpassQuery(lat: number, lon: number, radiusKm: number, niche: string): string {
  const radiusMeters = Math.round(radiusKm * 1000);
  const tags = resolveNicheTags(niche);

  const clauses = tags
    ? tags
        .map(
          (t) =>
            `node(around:${radiusMeters},${lat},${lon})["${t.key}"="${t.value}"];` +
            `way(around:${radiusMeters},${lat},${lon})["${t.key}"="${t.value}"];`
        )
        .join('')
    : // Nișă necunoscută în dicționar — fallback: potrivire liberă pe numele locului
      (() => {
        const safeNiche = niche.replace(/["\\]/g, '');
        return (
          `node(around:${radiusMeters},${lat},${lon})["name"~"${safeNiche}",i];` +
          `way(around:${radiusMeters},${lat},${lon})["name"~"${safeNiche}",i];`
        );
      })();

  return `[out:json][timeout:25];(${clauses});out center tags;`;
}

/**
 * Overpass API (OpenStreetMap) — căutare pe categorie/tag-uri reale, gratuit,
 * fără cheie. Documentație: https://wiki.openstreetmap.org/wiki/Overpass_API
 * Policy: sub 10.000 interogări/zi, sub 1 GB/zi — mult peste ce are nevoie
 * un scan ocazional din UI.
 */
export async function searchPlaces(
  niche: string,
  location: string,
  radiusKm: number
): Promise<PlaceResult[]> {
  const center = await geocodeLocation(location);
  if (!center) {
    throw new Error(`Nu am putut localiza "${location}" — verifică denumirea locației.`);
  }

  const query = buildOverpassQuery(center.lat, center.lon, radiusKm, niche);

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent(),
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Overpass API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { elements?: OverpassElement[] };

  return (data.elements ?? [])
    .filter((el) => el.tags?.name)
    .map((el) => {
      const tags = el.tags as OsmTags;
      const addressParts = [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']].filter(Boolean);

      return {
        placeId: `${el.type}-${el.id}`,
        companyName: tags.name as string,
        website: tags.website ?? tags['contact:website'] ?? null,
        address: addressParts.length > 0 ? addressParts.join(' ') : null,
        phone: tags.phone ?? tags['contact:phone'] ?? null,
        email: tags.email ?? tags['contact:email'] ?? null,
      };
    });
}
