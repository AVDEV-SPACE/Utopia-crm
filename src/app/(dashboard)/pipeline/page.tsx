'use client';

import { useEffect, useState, useCallback, useRef, Suspense, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';
import { PipelineTable } from '@/components/pipeline/PipelineTable';
import { PipelineDetailSheet } from '@/components/pipeline/PipelineDetailSheet';
import { EnginePanel } from '@/components/pipeline/EnginePanel';
import { OutreachPanel } from '@/components/pipeline/OutreachPanel';
import { CampaignPanel } from '@/components/pipeline/CampaignPanel';
import { TestLeadButton } from '@/components/pipeline/TestLeadButton';
import { Button } from '@/components/ui/button';
import { CountUp } from '@/components/motion/CountUp';
import { SegmentedControl } from '@/components/motion/SegmentedControl';
import {
  ALL,
  ActiveFilterChips,
  FilterSelect,
  SearchField,
  type ActiveChip,
  type FilterOption,
} from '@/components/filters/FilterControls';
import { useOutreachAutoSync } from '@/hooks/use-outreach-auto-sync';
import { useUrlFilters, withoutParam } from '@/hooks/use-url-filters';
import { fetchJson, peek } from '@/lib/data-cache';
import { STAGE_LABELS, PIPELINE_STAGES } from '@/services/pipeline/stages';
import type { PipelineFacets, PipelineKpi, PipelineLeadRow } from '@/services/pipeline/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/** Etichete pentru sursele stocate în `leads.source`. */
const SOURCE_LABELS: Record<string, string> = {
  sheet: 'Google Sheet',
  crm: 'Lead Generation',
  missed_call: 'Apel pierdut',
  website: 'Site',
  engine: 'Motor leaduri',
  linkedin: 'Import CSV',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

const ICP_OPTIONS: FilterOption[] = [
  { value: '1', label: 'Da' },
  { value: '0', label: 'Nu' },
];

/** Praguri pe nota Google (0–5). */
const RATING_OPTIONS: FilterOption[] = [
  { value: '4.5', label: '★ 4.5+' },
  { value: '4', label: '★ 4+' },
  { value: '3', label: '★ 3+' },
  { value: 'none', label: 'Fără rating' },
];

/** Intervale pe scor (0–100). */
const SCORE_OPTIONS: FilterOption[] = [
  { value: '70', label: '70+' },
  { value: '40', label: '40+' },
  { value: 'lt40', label: 'sub 40' },
  { value: 'none', label: 'Fără scor' },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: 'date', label: 'Cele mai noi' },
  { value: 'score', label: 'Scor ↓' },
];

const EMPTY_KPI: PipelineKpi = {
  total: 0,
  icpMatch: 0,
  segmentA: 0,
  queuedEmail: 0,
  replied: 0,
  callBooked: 0,
  won: 0,
};

const EMPTY_FACETS: PipelineFacets = { cities: [], segments: [], stages: [], niches: [], categories: [], sources: [] };

/** Filtrele din URL; `view=pitched` vine și din cardul „Pitched” de pe Overview. */
const FILTER_DEFAULTS = {
  view: 'leads',
  q: '',
  source: ALL,
  stage: ALL,
  segment: ALL,
  icp: ALL,
  score: ALL,
  rating: ALL,
  city: ALL,
  niche: ALL,
  category: ALL,
  sort: 'date',
} as const;

type FilterKey = keyof typeof FILTER_DEFAULTS;

interface PipelineResponse {
  leads: PipelineLeadRow[];
  total: number;
  kpi: PipelineKpi;
  facets: PipelineFacets;
}

/**
 * URL-ul listei pentru filtrele și pagina date. E și cheia din cache-ul de date:
 * pentru filtrele implicite dă exact `PAGE_DATA.pipeline` (preload-ul din sidebar).
 */
function pipelineUrl(f: Record<FilterKey, string>, page: number): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
    sort: f.sort,
  });
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.source !== ALL) params.set('source', f.source);
  if (f.stage !== ALL) params.set('stage', f.stage);
  if (f.segment !== ALL) params.set('segment', f.segment);
  if (f.icp !== ALL) params.set('icp', f.icp);
  if (f.rating !== ALL) params.set('rating', f.rating);
  // „sub 40” e o limită superioară, restul opțiunilor sunt praguri minime
  if (f.score === 'lt40') params.set('scoreMax', '39');
  else if (f.score !== ALL) params.set('score', f.score);
  if (f.city !== ALL) params.set('city', f.city);
  if (f.niche !== ALL) params.set('niche', f.niche);
  if (f.category !== ALL) params.set('category', f.category);
  return `/api/pipeline/manage?${params}`;
}

const asOptions = (values: string[], labels?: Record<string, string>): FilterOption[] =>
  values.map((v) => ({ value: v, label: labels?.[v] ?? v }));

export default function PipelinePage() {
  // `useSearchParams` are nevoie de o graniță Suspense la randare
  return (
    <Suspense fallback={null}>
      <PipelineContent />
    </Suspense>
  );
}

/**
 * Pagina unică a leadurilor (fostele /leads și /pipeline): găsire (motor,
 * import Google Sheet), outreach (modele, campanii), lista cu toate leadurile
 * din CRM și fișa lateral cu etapă, detalii, mesaje și conversație.
 */
function PipelineContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Deep-link: /pipeline?lead=<id> deschide direct fișa
  const [activeId, setActiveId] = useState<string | null>(() => searchParams.get('lead'));
  const { values: f, set, reset } = useUrlFilters<FilterKey>(FILTER_DEFAULTS);
  const [page, setPage] = useState(0);
  const showPitched = f.view === 'pitched';

  // Răspunsul din cache pentru filtrele de la intrare (vizită anterioară sau
  // preload la hover pe sidebar): lista și KPI-urile apar instant, fără skeleton.
  const [initial] = useState(() => peek<PipelineResponse>(pipelineUrl(f, 0)));
  const [leads, setLeads] = useState<PipelineLeadRow[]>(initial?.leads ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [kpi, setKpi] = useState<PipelineKpi>(initial?.kpi ?? EMPTY_KPI);
  const [facets, setFacets] = useState<PipelineFacets>(initial?.facets ?? EMPTY_FACETS);
  const [loading, setLoading] = useState(!initial);

  // Ultimul request în zbor: un răspuns lent pentru o căutare veche nu are voie
  // să suprascrie lista unei căutări mai noi.
  const inFlight = useRef<AbortController | null>(null);

  const fetchLeads = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    try {
      const data = await fetchJson<PipelineResponse>(pipelineUrl(f, page), { signal: controller.signal });
      setLeads(data.leads);
      setTotal(data.total);
      setKpi(data.kpi);
      setFacets(data.facets);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error(err);
      toast.error('Eroare la încărcarea leadurilor');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
    // `f` se schimbă doar când se schimbă un filtru; lista de mai jos e cea care contează
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.q, f.source, f.stage, f.segment, f.icp, f.rating, f.score, f.city, f.niche, f.category, f.sort, page]);

  // Debounce pe căutare; filtrele și paginarea se aplică imediat.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchLeads, f.q.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchLeads, f.q]);

  // Răspunsurile și deschiderile schimbă etapele în fundal: lista se reîmprospătează singură
  useOutreachAutoSync(fetchLeads);

  // Orice filtru schimbat repornește paginarea, altfel un offset vechi dă o pagină goală.
  useEffect(() => {
    setPage(0);
  }, [f.q, f.source, f.stage, f.segment, f.icp, f.rating, f.score, f.city, f.niche, f.category, f.sort]);

  function closeDetail() {
    setActiveId(null);
    // Doar parametrul `lead` dispare; filtrele din URL rămân
    if (searchParams.get('lead')) router.replace(withoutParam(pathname, 'lead'), { scroll: false });
  }

  /** Orice filtru schimbat închide vizualizarea „Jurnal”, care ignoră filtrele. */
  const setFilter = (key: FilterKey) => (value: string) => {
    set(key, value);
    if (key !== 'sort') set('view', 'leads');
  };

  // Etapele de filtrat: ordinea pâlniei, doar cele care chiar apar în date
  const stageOptions: FilterOption[] = [
    ...PIPELINE_STAGES.filter((s) => facets.stages.includes(s)).map((s) => ({ value: s, label: STAGE_LABELS[s] })),
    // Etape necunoscute venite din import rămân filtrabile
    ...facets.stages
      .filter((s) => !(PIPELINE_STAGES as readonly string[]).includes(s))
      .map((s) => ({ value: s, label: s })),
  ];
  const sourceOptions = asOptions(facets.sources, SOURCE_LABELS);

  const labelOf = (options: FilterOption[], value: string) => options.find((o) => o.value === value)?.label ?? value;
  const chipFor = (key: FilterKey, name: string, options?: FilterOption[]): ActiveChip | null =>
    f[key] !== ALL && f[key] !== ''
      ? { key, label: `${name}: ${options ? labelOf(options, f[key]) : f[key]}`, onRemove: () => set(key, ALL) }
      : null;
  const chips = [
    f.q.trim() ? { key: 'q', label: `„${f.q.trim()}”`, onRemove: () => set('q', '') } : null,
    chipFor('source', 'Sursă', sourceOptions),
    chipFor('stage', 'Etapă', stageOptions),
    chipFor('segment', 'Segment'),
    chipFor('icp', 'ICP', ICP_OPTIONS),
    chipFor('score', 'Scor', SCORE_OPTIONS),
    chipFor('rating', 'Rating', RATING_OPTIONS),
    chipFor('city', 'Oraș'),
    chipFor('niche', 'Nișă'),
    chipFor('category', 'Categorie'),
  ].filter((c): c is ActiveChip => c !== null);

  const hasFilters = chips.length > 0;
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h1 className="page-title text-stone-100">Pipeline leaduri</h1>
          <p className="text-sm text-stone-500">
            Toate leadurile la un loc — găsite de motor, importate (Google Sheet, CSV) sau venite din site și apeluri —
            cu etapa de outreach la zi. Deschide un lead ca să-i vezi semnalele, să-i scrii și să vezi conversația.
          </p>
        </div>
        <TestLeadButton onOpen={setActiveId} onChanged={fetchLeads} />
      </div>

      {/* Setări, grupate: de unde vin leadurile și cum sunt contactate */}
      <SectionGroup title="Găsire lead-uri">
        <EnginePanel onChanged={fetchLeads} />
      </SectionGroup>

      <SectionGroup title="Outreach">
        <OutreachPanel />
        <CampaignPanel onChanged={fetchLeads} />
      </SectionGroup>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Total" value={kpi.total} onClick={() => reset(['sort'])} />
        <KpiCard label="ICP match" value={kpi.icpMatch} onClick={() => setFilter('icp')('1')} />
        <KpiCard label="Segment A" value={kpi.segmentA} onClick={() => setFilter('segment')('A')} />
        <KpiCard label="În coadă email" value={kpi.queuedEmail} onClick={() => setFilter('stage')('QUEUED_EMAIL')} />
        <KpiCard label="Răspunsuri" value={kpi.replied} accent />
        <KpiCard label="Call programat" value={kpi.callBooked} accent onClick={() => setFilter('stage')('CALL_BOOKED')} />
        <KpiCard label="Câștigate" value={kpi.won} accent onClick={() => setFilter('stage')('WON')} />
      </div>

      {/* Bara de filtre: un control per filtru, rămâne vizibilă la scroll */}
      <section className="filter-bar sticky top-0 z-20 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Vizualizare"
            value={showPitched ? 'pitched' : 'leads'}
            onChange={(v) => set('view', v)}
            options={[
              { value: 'leads', label: 'Lead-uri' },
              { value: 'pitched', label: 'Jurnal trimiteri' },
            ]}
          />
          {!showPitched && (
            <SearchField
              value={f.q}
              onChange={setFilter('q')}
              placeholder="Caută după firmă, domeniu, oraș, nișă, telefon sau email..."
              className="flex-1 min-w-[220px]"
            />
          )}
        </div>

        {!showPitched && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {stageOptions.length > 0 && <FilterSelect label="Etapă" value={f.stage} options={stageOptions} onChange={setFilter('stage')} />}
              {sourceOptions.length > 1 && <FilterSelect label="Sursă" value={f.source} options={sourceOptions} onChange={setFilter('source')} />}
              {facets.niches.length > 0 && <FilterSelect label="Nișă" value={f.niche} options={asOptions(facets.niches)} onChange={setFilter('niche')} />}
              {facets.cities.length > 0 && <FilterSelect label="Oraș" value={f.city} options={asOptions(facets.cities)} onChange={setFilter('city')} />}
              {facets.categories.length > 0 && <FilterSelect label="Categorie" value={f.category} options={asOptions(facets.categories)} onChange={setFilter('category')} />}
              {facets.segments.length > 0 && <FilterSelect label="Segment" value={f.segment} options={asOptions(facets.segments)} onChange={setFilter('segment')} />}
              <FilterSelect label="ICP" value={f.icp} options={ICP_OPTIONS} onChange={setFilter('icp')} />
              <FilterSelect label="Scor" value={f.score} options={SCORE_OPTIONS} onChange={setFilter('score')} />
              <FilterSelect label="Rating" value={f.rating} options={RATING_OPTIONS} onChange={setFilter('rating')} />
              <span className="hidden sm:block w-px h-5 bg-[var(--card-border)] mx-1" />
              <FilterSelect label="Sortare" value={f.sort} options={SORT_OPTIONS} onChange={setFilter('sort')} hideAll />
              {!loading && (
                <span className="ml-auto text-xs text-stone-500 tabular-nums shrink-0">
                  {total} {total === 1 ? 'lead' : 'lead-uri'}
                  {hasFilters ? ' potrivite' : ''}
                </span>
              )}
            </div>
            <ActiveFilterChips chips={chips} onReset={() => reset(['view', 'sort'])} />
          </>
        )}
      </section>

      {showPitched ? (
        <SentMessagesTable
          recipientType="lead"
          emptyMessage="Niciun pitch trimis încă. Mesajele și mail-urile trimise către lead-uri apar aici."
        />
      ) : (
        <>
          <PipelineTable
            leads={leads}
            loading={loading}
            showWebsite
            onOpen={(lead) => setActiveId(lead.id)}
            emptyMessage={
              hasFilters
                ? 'Niciun lead pentru filtrele curente.'
                : 'Niciun lead încă. Rulează „New leads” sau importă un Google Sheet mai sus.'
            }
          />

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Înapoi
              </Button>
              <span className="text-xs text-stone-600">
                Pagina {page + 1} din {lastPage + 1}
              </span>
              <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
                Înainte
              </Button>
            </div>
          )}
        </>
      )}

      <PipelineDetailSheet leadId={activeId} onClose={closeDetail} onUpdated={fetchLeads} />
    </div>
  );
}

/** Un grup de panouri de setări, cu eticheta lui (aceeași tipografie ca sidebar-ul). */
function SectionGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-[10.5px] uppercase tracking-[0.12em] font-medium" style={{ color: 'rgb(var(--line-rgb) / 0.45)' }}>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function KpiCard({ label, value, accent, onClick }: { label: string; value: number; accent?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium truncate">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ? 'text-amber-400' : 'text-stone-100'}`}>
        <CountUp value={value} />
      </p>
    </>
  );
  const cls = `glass-card ${accent ? 'glass-card--tint' : ''} px-4 py-3 text-left w-full`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls} title={`Filtrează: ${label}`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}
