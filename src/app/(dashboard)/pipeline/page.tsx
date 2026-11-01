'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryFilter } from '@/components/leads/CategoryFilter';
import { ImportForm } from '@/components/leads/ImportForm';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';
import { PipelineTable } from '@/components/pipeline/PipelineTable';
import { PipelineDetailSheet } from '@/components/pipeline/PipelineDetailSheet';
import { EnginePanel } from '@/components/pipeline/EnginePanel';
import { OutreachPanel } from '@/components/pipeline/OutreachPanel';
import { CampaignPanel } from '@/components/pipeline/CampaignPanel';
import { TestLeadButton } from '@/components/pipeline/TestLeadButton';
import { Button } from '@/components/ui/button';
import { useOutreachAutoSync } from '@/hooks/use-outreach-auto-sync';
import { STAGE_LABELS, PIPELINE_STAGES } from '@/services/pipeline/stages';
import type { PipelineFacets, PipelineKpi, PipelineLeadRow } from '@/services/pipeline/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface Option {
  value: string;
  label: string;
}

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

const ICP_OPTIONS: Option[] = [
  { value: 'all', label: 'Toate' },
  { value: '1', label: 'Da' },
  { value: '0', label: 'Nu' },
];

/** Praguri pe nota Google (0–5). */
const RATING_OPTIONS: Option[] = [
  { value: 'all', label: 'Toate' },
  { value: '4.5', label: '★ 4.5+' },
  { value: '4', label: '★ 4+' },
  { value: '3', label: '★ 3+' },
  { value: 'none', label: 'Fără rating' },
];

/** Intervale pe scor (0–100). */
const SCORE_OPTIONS: Option[] = [
  { value: 'all', label: 'Toate' },
  { value: '70', label: '70+' },
  { value: '40', label: '40+' },
  { value: 'lt40', label: 'sub 40' },
  { value: 'none', label: 'Fără scor' },
];

const SORT_OPTIONS: Option[] = [
  { value: 'date', label: 'Cele mai noi' },
  { value: 'score', label: 'Scor' },
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
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<PipelineLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [kpi, setKpi] = useState<PipelineKpi>(EMPTY_KPI);
  const [facets, setFacets] = useState<PipelineFacets>(EMPTY_FACETS);
  const [loading, setLoading] = useState(true);
  // Deep-link: /pipeline?lead=<id> deschide direct fișa
  const [activeId, setActiveId] = useState<string | null>(() => searchParams.get('lead'));
  // Deep-link din cardul „Pitched” de pe Overview: /pipeline?view=pitched
  const [showPitched, setShowPitched] = useState(() => searchParams.get('view') === 'pitched');

  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [stage, setStage] = useState('all');
  const [segment, setSegment] = useState('all');
  const [icp, setIcp] = useState('all');
  const [score, setScore] = useState('all');
  const [rating, setRating] = useState('all');
  const [city, setCity] = useState('all');
  const [niche, setNiche] = useState('all');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('date');
  const [page, setPage] = useState(0);

  // Ultimul request în zbor: un răspuns lent pentru o căutare veche nu are voie
  // să suprascrie lista unei căutări mai noi.
  const inFlight = useRef<AbortController | null>(null);

  const fetchLeads = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      sort,
    });
    if (search.trim()) params.set('q', search.trim());
    if (source !== 'all') params.set('source', source);
    if (stage !== 'all') params.set('stage', stage);
    if (segment !== 'all') params.set('segment', segment);
    if (icp !== 'all') params.set('icp', icp);
    if (rating !== 'all') params.set('rating', rating);
    // „sub 40” e o limită superioară, restul opțiunilor sunt praguri minime
    if (score === 'lt40') params.set('scoreMax', '39');
    else if (score !== 'all') params.set('score', score);
    if (city !== 'all') params.set('city', city);
    if (niche !== 'all') params.set('niche', niche);
    if (category !== 'all') params.set('category', category);

    try {
      const res = await fetch(`/api/pipeline/manage?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Nu am putut încărca leadurile');
      const data = await res.json();
      setLeads(data.leads as PipelineLeadRow[]);
      setTotal(data.total as number);
      setKpi(data.kpi as PipelineKpi);
      setFacets(data.facets as PipelineFacets);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error(err);
      toast.error('Eroare la încărcarea leadurilor');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [search, source, stage, segment, icp, rating, score, city, niche, category, sort, page]);

  // Debounce pe căutare; filtrele și paginarea se aplică imediat.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchLeads, search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchLeads, search]);

  // Răspunsurile și deschiderile schimbă etapele în fundal: lista se reîmprospătează singură
  useOutreachAutoSync(fetchLeads);

  // Orice filtru schimbat repornește paginarea, altfel un offset vechi dă o pagină goală.
  useEffect(() => {
    setPage(0);
  }, [search, source, stage, segment, icp, rating, score, city, niche, category, sort]);

  function closeDetail() {
    setActiveId(null);
    if (searchParams.get('lead')) router.replace('/pipeline', { scroll: false });
  }

  /** Orice filtru schimbat închide vizualizarea „Pitched”, care ignoră filtrele. */
  const applyFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setShowPitched(false);
  };

  // Etapele de filtrat: ordinea pâlniei, doar cele care chiar apar în date
  const stageOptions: Option[] = [
    { value: 'all', label: 'Toate' },
    ...PIPELINE_STAGES.filter((s) => facets.stages.includes(s)).map((s) => ({ value: s, label: STAGE_LABELS[s] })),
    // Etape necunoscute venite din import rămân filtrabile
    ...facets.stages
      .filter((s) => !(PIPELINE_STAGES as readonly string[]).includes(s))
      .map((s) => ({ value: s, label: s })),
  ];

  const hasFilters =
    search.trim() !== '' ||
    [source, stage, segment, icp, rating, score, city, niche, category].some((value) => value !== 'all');

  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title text-stone-100">Pipeline leaduri</h1>
          <p className="text-sm text-stone-500">
            Toate leadurile la un loc — găsite de motor, importate (Google Sheet, CSV) sau venite din site și apeluri —
            cu etapa de outreach la zi. Deschide un lead ca să-i vezi semnalele, să-i scrii și să vezi conversația.
          </p>
        </div>
        <TestLeadButton onOpen={setActiveId} onChanged={fetchLeads} />
      </div>

      {/* Găsire: motorul (nișe × orașe) și importul din Google Sheet */}
      <EnginePanel onChanged={fetchLeads} />
      <ImportForm
        onImported={() => {
          setPage(0);
          fetchLeads();
        }}
      />

      {/* Outreach: modelele pașilor și campaniile pe filtre */}
      <OutreachPanel />
      <CampaignPanel onChanged={fetchLeads} />

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiCard label="Total" value={kpi.total} />
        <KpiCard label="ICP match" value={kpi.icpMatch} />
        <KpiCard label="Segment A" value={kpi.segmentA} />
        <KpiCard label="În coadă email" value={kpi.queuedEmail} />
        <KpiCard label="Răspunsuri" value={kpi.replied} accent />
        <KpiCard label="Call programat" value={kpi.callBooked} accent />
        <KpiCard label="Câștigate" value={kpi.won} accent />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" size={15} />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowPitched(false);
          }}
          placeholder="Caută după firmă, domeniu, oraș, nișă, telefon sau email..."
          className="w-full bg-stone-900/60 border border-stone-800/60 rounded-xl pl-10 pr-9 py-2.5 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            title="Golește căutarea"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-600 hover:text-stone-300"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {facets.sources.length > 1 && (
          <OptionRow
            label="Sursă"
            options={[{ value: 'all', label: 'Toate' }, ...facets.sources.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s }))]}
            selected={source}
            onSelect={applyFilter(setSource)}
          />
        )}
        {stageOptions.length > 1 && (
          <OptionRow label="Etapă" options={stageOptions} selected={stage} onSelect={applyFilter(setStage)} />
        )}
        {facets.segments.length > 0 && (
          <OptionRow
            label="Segment"
            options={[{ value: 'all', label: 'Toate' }, ...facets.segments.map((s) => ({ value: s, label: s }))]}
            selected={segment}
            onSelect={applyFilter(setSegment)}
          />
        )}
        <OptionRow label="ICP" options={ICP_OPTIONS} selected={icp} onSelect={applyFilter(setIcp)} />
        <OptionRow label="Scor" options={SCORE_OPTIONS} selected={score} onSelect={applyFilter(setScore)} />
        <OptionRow label="Rating" options={RATING_OPTIONS} selected={rating} onSelect={applyFilter(setRating)} />
        {facets.cities.length > 0 && (
          <FilterRow label="Oraș" values={facets.cities} selected={city} onSelect={applyFilter(setCity)} />
        )}
        {facets.niches.length > 0 && (
          <FilterRow label="Nișă" values={facets.niches} selected={niche} onSelect={applyFilter(setNiche)} />
        )}
        {facets.categories.length > 0 && (
          <FilterRow label="Categorie" values={facets.categories} selected={category} onSelect={applyFilter(setCategory)} />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-3">
            <OptionRow label="Sortare" options={SORT_OPTIONS} selected={sort} onSelect={setSort} />
            <button
              onClick={() => setShowPitched((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                showPitched
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
              }`}
            >
              <Send size={12} />
              Pitched
            </button>
          </div>
          {!showPitched && !loading && (
            <span className="text-xs text-stone-600 shrink-0">
              {total} {total === 1 ? 'lead' : 'lead-uri'}
              {hasFilters ? ' potrivite' : ''}
            </span>
          )}
        </div>
      </div>

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

function KpiCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-stone-800/60 bg-stone-900/60 px-4 py-3">
      <p className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium truncate">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? 'text-amber-400' : 'text-stone-100'}`}>
        {value}
      </p>
    </div>
  );
}

/** Un rând de chips etichetat, peste `CategoryFilter` (valorile sunt și etichete). */
function FilterRow({
  label,
  values,
  selected,
  onSelect,
}: {
  label: string;
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-stone-100 uppercase tracking-[0.15em] font-medium w-16 shrink-0">
        {label}
      </span>
      <CategoryFilter categories={values} selected={selected} onSelect={onSelect} />
    </div>
  );
}

/** Rând de chips cu etichete diferite de valori (praguri, surse, etape). */
function OptionRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Option[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-stone-100 uppercase tracking-[0.15em] font-medium w-16 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              selected === option.value
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
