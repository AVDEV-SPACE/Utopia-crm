export interface OsmTag {
  key: string;
  value: string;
}

/**
 * Nominatim nu face full-text search pe categorie (e un geocoder — potrivește
 * doar nume/adrese literale + câteva "special phrases" în engleză). Pentru
 * căutare pe nișă folosim Overpass API cu tag-uri OSM reale, deci avem nevoie
 * de o traducere nișă (RO, text liber) → tag(uri) OSM.
 *
 * Cheile sunt normalizate (lowercase, fără diacritice) — vezi normalizeNiche.
 * Adaugă aici orice nișă nouă întâlnită des.
 */
const NICHE_TAGS: Record<string, OsmTag[]> = {
  dentist: [{ key: 'amenity', value: 'dentist' }],
  stomatologie: [{ key: 'amenity', value: 'dentist' }],
  restaurant: [{ key: 'amenity', value: 'restaurant' }],
  cafenea: [{ key: 'amenity', value: 'cafe' }],
  cafea: [{ key: 'amenity', value: 'cafe' }],
  constructii: [
    { key: 'office', value: 'construction_company' },
    { key: 'craft', value: 'builder' },
  ],
  montaje: [
    { key: 'office', value: 'construction_company' },
    { key: 'craft', value: 'builder' },
  ],
  frizerie: [{ key: 'shop', value: 'hairdresser' }],
  coafor: [{ key: 'shop', value: 'hairdresser' }],
  hairdresser: [{ key: 'shop', value: 'hairdresser' }],
  beauty: [{ key: 'shop', value: 'beauty' }],
  cosmetica: [{ key: 'shop', value: 'beauty' }],
  clinica: [{ key: 'amenity', value: 'clinic' }],
  'salon frumusete': [{ key: 'shop', value: 'beauty' }],
  'salon infrumusetare': [{ key: 'shop', value: 'beauty' }],
  spa: [{ key: 'leisure', value: 'spa' }],
  veterinar: [{ key: 'amenity', value: 'veterinary' }],
  avocat: [{ key: 'office', value: 'lawyer' }],
  contabil: [{ key: 'office', value: 'accountant' }],
  contabilitate: [{ key: 'office', value: 'accountant' }],
  imobiliare: [{ key: 'office', value: 'estate_agent' }],
  farmacie: [{ key: 'amenity', value: 'pharmacy' }],
  'service auto': [{ key: 'shop', value: 'car_repair' }],
  hotel: [{ key: 'tourism', value: 'hotel' }],
  pensiune: [{ key: 'tourism', value: 'guest_house' }],
  fitness: [{ key: 'leisure', value: 'fitness_centre' }],
  florarie: [{ key: 'shop', value: 'florist' }],
  brutarie: [{ key: 'shop', value: 'bakery' }],
  patiserie: [{ key: 'shop', value: 'bakery' }],
  optica: [{ key: 'shop', value: 'optician' }],
  mobila: [{ key: 'shop', value: 'furniture' }],
  mobilier: [{ key: 'shop', value: 'furniture' }],
};

export function normalizeNiche(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // scoate diacriticele (ă, â, î, ș, ț)
    .trim();
}

/** Returnează tag-urile OSM pentru o nișă, sau null dacă nu are corespondent cunoscut. */
export function resolveNicheTags(niche: string): OsmTag[] | null {
  const normalized = normalizeNiche(niche);

  if (NICHE_TAGS[normalized]) return NICHE_TAGS[normalized];

  for (const [key, tags] of Object.entries(NICHE_TAGS)) {
    if (normalized.includes(key) || key.includes(normalized)) return tags;
  }

  return null;
}
