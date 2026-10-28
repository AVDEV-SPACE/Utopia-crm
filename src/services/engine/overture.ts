import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { normalizeNiche } from '@/services/leads/osm-categories';
import { normalizeEmail, normalizeWebsite } from './normalize';
import { locateCity } from './osm';
import type { EngineCandidate } from './types';

/**
 * Descoperire prin Overture Maps Places (date deschise, gratuite, fără cheie):
 * fișiere Parquet publice pe S3, citite cu DuckDB doar pentru dreptunghiul
 * orașului. Majoritatea firmelor vin din paginile Meta de business, deci
 * acoperirea e mult peste OSM (Oradea: 182 stomatologi față de 3).
 * Documentație: https://docs.overturemaps.org/guides/places/
 *
 * Activă implicit; ENGINE_OVERTURE=false o oprește.
 */
export function isOvertureEnabled(): boolean {
  return process.env.ENGINE_OVERTURE !== 'false';
}

/** Sub acest scor de încredere Overture are multe înregistrări greșite. */
const MIN_CONFIDENCE = 0.5;

/** Timpul minim rămas ca să merite pornită interogarea (citirea durează ~20s). */
export const OVERTURE_MIN_TIME_MS = 30_000;

/**
 * Nișă (normalizată, ca în osm-categories) → categorii din taxonomia Overture.
 * O firmă se potrivește dacă oricare categorie apare în `taxonomy.hierarchy`,
 * deci o categorie-părinte le include pe cele de sub ea.
 */
const NICHE_CATEGORIES: Record<string, string[]> = {
  dentist: ['dental_clinic'],
  stomatologie: ['dental_clinic'],
  restaurant: ['restaurant'],
  pizzerie: ['pizza_restaurant'],
  pizza: ['pizza_restaurant'],
  cafenea: ['cafe', 'coffee_shop'],
  cafea: ['cafe', 'coffee_shop'],
  constructii: ['building_or_construction_service', 'contractor', 'home_developer'],
  montaje: ['building_or_construction_service', 'contractor'],
  frizerie: ['barber', 'hair_salon'],
  coafor: ['hair_salon', 'barber'],
  hairdresser: ['hair_salon', 'barber'],
  beauty: ['beauty_salon', 'skin_care_and_makeup', 'nail_salon'],
  cosmetica: ['beauty_salon', 'skin_care_and_makeup'],
  'salon frumusete': ['beauty_salon', 'nail_salon', 'skin_care_and_makeup'],
  'salon infrumusetare': ['beauty_salon', 'nail_salon', 'skin_care_and_makeup'],
  clinica: ['outpatient_care_facility', 'medical_service_organization'],
  spa: ['spa', 'massage_therapy'],
  veterinar: ['veterinary_care'],
  avocat: ['attorney_or_law_firm'],
  contabil: ['accountant'],
  contabilitate: ['accountant'],
  imobiliare: ['real_estate_service'],
  farmacie: ['pharmacy'],
  'service auto': ['automotive_repair', 'auto_body_shop'],
  hotel: ['hotel'],
  pensiune: ['bed_and_breakfast', 'private_lodging'],
  fitness: ['gym', 'fitness_studio', 'fitness_trainer'],
  florarie: ['flowers_and_gifts_store'],
  brutarie: ['bakery'],
  patiserie: ['bakery'],
  optica: ['eyewear_store', 'optometry'],
  mobila: ['furniture_store'],
  mobilier: ['furniture_store'],
  medic: ['doctors_office', 'primary_care_or_general_clinic'],
  'cabinet medical': ['doctors_office', 'primary_care_or_general_clinic'],
  psiholog: ['psychiatry_or_psychology_service', 'counseling'],
  kinetoterapie: ['physical_medicine_and_rehabilitation'],
  fizioterapie: ['physical_medicine_and_rehabilitation'],
  laborator: ['laboratory_testing'],
  tatuaje: ['tattoo_and_piercing'],
  manichiura: ['nail_salon'],
  'scoala soferi': ['driving_school'],
  gradinita: ['preschool', 'day_care_preschool'],
  croitorie: ['sewing_and_alterations'],
  curatatorie: ['dry_cleaning', 'laundry_service'],
  'spalatorie auto': ['car_wash', 'auto_detailing'],
  vulcanizare: ['tire_dealer_and_repair', 'tire_shop'],
  bijuterii: ['jewelry_store'],
  cofetarie: ['dessert_shop'],
  'fast food': ['fast_food_restaurant'],
  notar: ['notary_public'],
  asigurari: ['insurance_agency'],
  'agentie turism': ['travel_service'],
  fotograf: ['photography_service'],
  arhitect: ['architectural_designer'],
  'pet shop': ['animal_and_pet_store'],
};

function resolveCategories(niche: string): string[] {
  const normalized = normalizeNiche(niche);
  if (NICHE_CATEGORIES[normalized]) return NICHE_CATEGORIES[normalized];
  if (normalized.length < 4) return [];
  for (const [key, categories] of Object.entries(NICHE_CATEGORIES)) {
    if (normalized.includes(key) || key.includes(normalized)) return categories;
  }
  return [];
}

// ─── DuckDB ──────────────────────────────────────────────────────────────────

let instancePromise: Promise<DuckDBInstance> | null = null;

/** O singură instanță per proces; extensiile se descarcă în /tmp (singurul director scriibil pe Vercel). */
function duckdb(): Promise<DuckDBInstance> {
  instancePromise ??= (async () => {
    const { DuckDBInstance } = await import('@duckdb/node-api');
    const dir = join(tmpdir(), 'duckdb');
    // DuckDB nu creează singur directorul home
    await mkdir(join(dir, 'tmp'), { recursive: true });
    const instance = await DuckDBInstance.create(':memory:', {
      home_directory: dir,
      extension_directory: join(dir, 'extensions'),
      temp_directory: join(dir, 'tmp'),
    });
    const setup = await instance.connect();
    await setup.run(`INSTALL httpfs; LOAD httpfs; SET s3_region = 'us-west-2';`);
    setup.closeSync();
    return instance;
  })().catch((err) => {
    instancePromise = null; // următoarea rulare reîncearcă
    throw err;
  });
  return instancePromise;
}

let releaseCache: { value: string; at: number } | null = null;
const RELEASE_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;

/** Ultima versiune publicată (catalogul STAC); versiunile vechi se șterg din S3 după câteva luni. */
async function latestRelease(): Promise<string> {
  if (releaseCache && Date.now() - releaseCache.at < 6 * 3_600_000) return releaseCache.value;
  const res = await fetch('https://stac.overturemaps.org/catalog.json', { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`catalogul Overture ${res.status}`);
  const latest = ((await res.json()) as { latest?: string }).latest;
  if (!latest || !RELEASE_PATTERN.test(latest)) throw new Error('catalogul Overture nu indică ultima versiune');
  releaseCache = { value: latest, at: Date.now() };
  return latest;
}

interface OvertureRow {
  id: string;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  socials: string[] | null;
  address: string | null;
}

/** Interogarea, întreruptă la `deadline` ca rularea să încapă în maxDuration. */
async function query(conn: DuckDBConnection, sql: string, values: Record<string, string | number>, deadline: number) {
  const timer = setTimeout(() => conn.interrupt(), Math.max(deadline - Date.now() - 5_000, 1_000));
  try {
    return (await conn.runAndReadAll(sql, values)).getRowObjectsJson() as unknown as OvertureRow[];
  } catch (err) {
    if (Date.now() >= deadline - 5_000) throw new Error('Overture: timp epuizat');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const firstMatching = (urls: string[] | null, host: RegExp) => urls?.find((u) => host.test(u)) ?? null;

/**
 * Firmele unei nișe dintr-un oraș: categoria din taxonomie SAU numele conține
 * nișa; cu încredere ≥ 0.5, neînchise, cu un contact, fără lanțuri naționale.
 */
export async function discoverOverture(niche: string, city: string, deadline: number): Promise<EngineCandidate[]> {
  const categories = resolveCategories(niche);
  // Doar litere, cifre și spații; spațiile devin `%` în LIKE
  const words = normalizeNiche(niche).replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const pattern = words.join('%');
  // Cuvintele scurte (ex. „spa”) apar în prea multe nume; acolo ajunge categoria
  const useName = pattern.length >= 5 || (categories.length === 0 && pattern.length >= 3);
  if (categories.length === 0 && !useName) throw new Error(`Nișa „${niche}” e prea scurtă pentru căutare`);

  const [location, release, instance] = await Promise.all([locateCity(city), latestRelease(), duckdb()]);
  const { south, north, west, east } = location.bbox;

  // Categoriile vin din dicționarul de mai sus (constante), nu din input
  const categoryList = categories.map((c) => `'${c}'`).join(', ');
  const matchers = [
    categories.length > 0 ? `list_has_any(taxonomy.hierarchy, [${categoryList}])` : null,
    useName ? `strip_accents(lower(names.primary)) LIKE '%' || $pattern || '%'` : null,
  ].filter(Boolean);

  const conn = await instance.connect();
  try {
    const rows = await query(
      conn,
      `SELECT id, names.primary AS name, websites[1] AS website, phones[1] AS phone,
              emails[1] AS email, socials, addresses[1].freeform AS address
       FROM read_parquet('s3://overturemaps-us-west-2/release/${release}/theme=places/type=place/*', hive_partitioning = 1)
       WHERE bbox.xmin BETWEEN $west AND $east AND bbox.ymin BETWEEN $south AND $north
         AND confidence >= ${MIN_CONFIDENCE}
         AND coalesce(operating_status, 'open') = 'open'
         AND brand.names.primary IS NULL AND brand.wikidata IS NULL
         AND names.primary IS NOT NULL
         AND (websites IS NOT NULL OR phones IS NOT NULL OR emails IS NOT NULL OR socials IS NOT NULL)
         AND (${matchers.join(' OR ')})`,
      useName ? { west, east, south, north, pattern } : { west, east, south, north },
      deadline
    );

    return rows.map((r) => ({
      name: r.name.trim(),
      website: normalizeWebsite(r.website),
      email: normalizeEmail(r.email),
      phone: r.phone,
      address: r.address,
      niche,
      city,
      discovery: {
        source: 'overture',
        externalId: r.id,
        hasActiveMetaAds: false,
        metaPageId: null,
        facebook: firstMatching(r.socials, /facebook\.com/i),
        instagram: firstMatching(r.socials, /instagram\.com/i),
        linkedin: firstMatching(r.socials, /linkedin\.com/i),
      },
    }));
  } finally {
    conn.closeSync();
  }
}
