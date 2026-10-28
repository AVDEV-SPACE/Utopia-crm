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
  medic: [{ key: 'amenity', value: 'doctors' }],
  'cabinet medical': [{ key: 'amenity', value: 'doctors' }],
  psiholog: [{ key: 'healthcare', value: 'psychotherapist' }],
  kinetoterapie: [{ key: 'healthcare', value: 'physiotherapist' }],
  fizioterapie: [{ key: 'healthcare', value: 'physiotherapist' }],
  laborator: [{ key: 'healthcare', value: 'laboratory' }],
  tatuaje: [{ key: 'shop', value: 'tattoo' }],
  manichiura: [{ key: 'shop', value: 'beauty' }],
  'scoala soferi': [{ key: 'amenity', value: 'driving_school' }],
  gradinita: [{ key: 'amenity', value: 'kindergarten' }],
  croitorie: [{ key: 'craft', value: 'tailor' }],
  curatatorie: [{ key: 'shop', value: 'dry_cleaning' }],
  'spalatorie auto': [{ key: 'amenity', value: 'car_wash' }],
  vulcanizare: [{ key: 'shop', value: 'tyres' }],
  bijuterii: [{ key: 'shop', value: 'jewelry' }],
  cofetarie: [{ key: 'shop', value: 'confectionery' }],
  'fast food': [{ key: 'amenity', value: 'fast_food' }],
  notar: [{ key: 'office', value: 'notary' }],
  asigurari: [{ key: 'office', value: 'insurance' }],
  'agentie turism': [{ key: 'shop', value: 'travel_agency' }],
  fotograf: [{ key: 'craft', value: 'photographer' }],
  arhitect: [{ key: 'office', value: 'architect' }],
  'pet shop': [{ key: 'shop', value: 'pet' }],
};

/** Nișele din dicționar, pentru sugestiile din UI. */
export const KNOWN_NICHES = Object.keys(NICHE_TAGS);

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
  // Sub 4 litere potrivirea parțială prinde aproape orice cheie
  if (normalized.length < 4) return null;

  for (const [key, tags] of Object.entries(NICHE_TAGS)) {
    if (normalized.includes(key) || key.includes(normalized)) return tags;
  }

  return null;
}
