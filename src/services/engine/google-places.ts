import { normalizeWebsite } from './normalize';
import type { EngineCandidate } from './types';

/**
 * Google Places API (New) — Text Search. DEZACTIVAT implicit: are cost
 * potențial (facturare pe cerere după creditul gratuit lunar), deci rulează
 * doar dacă există GOOGLE_PLACES_API_KEY ȘI ENGINE_ALLOW_PLACES=true.
 */
export function isGooglePlacesEnabled(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY) && process.env.ENGINE_ALLOW_PLACES === 'true';
}

interface Place {
  id: string;
  displayName?: { text?: string };
  websiteUri?: string;
  formattedAddress?: string;
  nationalPhoneNumber?: string;
}

export async function discoverGooglePlaces(niche: string, city: string): Promise<EngineCandidate[]> {
  if (!isGooglePlacesEnabled()) return [];

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY as string,
      // Field mask minim: doar câmpurile de care avem nevoie (influențează costul)
      'X-Goog-FieldMask': 'places.id,places.displayName,places.websiteUri,places.formattedAddress,places.nationalPhoneNumber',
    },
    body: JSON.stringify({ textQuery: `${niche} ${city}`, languageCode: 'ro', regionCode: 'RO', pageSize: 20 }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { places?: Place[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Google Places ${res.status}: ${data.error?.message ?? 'eroare necunoscută'}`);

  return (data.places ?? [])
    .filter((p) => p.displayName?.text)
    .map((p) => ({
      name: (p.displayName?.text as string).trim(),
      website: normalizeWebsite(p.websiteUri),
      email: null,
      phone: p.nationalPhoneNumber ?? null,
      address: p.formattedAddress ?? null,
      niche,
      city,
      discovery: {
        source: 'google_places',
        externalId: p.id,
        hasActiveMetaAds: false,
        metaPageId: null,
        facebook: null,
        instagram: null,
        linkedin: null,
      },
    }));
}
