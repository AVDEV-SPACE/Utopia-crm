'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { CategoryFilter } from '@/components/leads/CategoryFilter';
import { PipelineTable } from '@/components/pipeline/PipelineTable';
import { PipelineDetailSheet } from '@/components/pipeline/PipelineDetailSheet';
import { EnginePanel } from '@/components/pipeline/EnginePanel';
import { OutreachPanel } from '@/components/pipeline/OutreachPanel';
import { Button } from '@/components/ui/button';
import { STAGE_LABELS, PIPELINE_STAGES } from '@/services/pipeline/stages';
import type { PipelineFacets, PipelineKpi, PipelineLeadRow } from '@/services/pipeline/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface Option {
  value: string;
  label: string;
}

const ICP_OPTIONS: Option[] = [
  { value: 'all', label: 'Toate' },
  { value: '1', label: 'Da' },
  { value: '0', label: 'Nu' },
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

export default function PipelinePage() {
  // `useSearchParams` are nevoie de o graniță Suspense la randare
  return (
    <Suspense fallback={null}>
      <PipelineContent />
    </Suspense>
  );
}

function PipelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<PipelineLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [kpi, setKpi] = useState<PipelineKpi>(EMPTY_KPI);
  const [facets, setFacets] = useState<PipelineFacets>({ cities: [], segments: [], stages: [] });
  const [loading, setLoading] = useState(true);
  // Deep-link: /pipeline?lead=<id> deschide direct fișa
  const [activeId, setActiveId] = useState<string | null>(() => searchParams.get('lead'));

  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [segment, setSegment] = useState('all');
  const [icp, setIcp] = useState('all');
  const [city, setCity] = useState('all');
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
    if (stage !== 'all') params.set('stage', stage);
    if (segment !== 'all') params.set('segment', segment);
    if (icp !== 'all') params.set('icp', icp);
    if (city !== 'all') params.set('city', city);

    try {
      const res = await fetch(`/api/pipeline/manage?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Nu am putut încărca pipeline-ul');
      const data = await res.json();
      setLeads(data.leads as PipelineLeadRow[]);
      setTotal(data.total as number);
      setKpi(data.kpi as PipelineKpi);
      setFacets(data.facets as PipelineFacets);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error(err);
      toast.error('Eroare la încărcarea pipeline-ului');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [search, stage, segment, icp, city, sort, page]);

  // Debounce pe căutare; filtrele și paginarea se aplică imediat.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchLeads, search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchLeads, search]);

  // Orice filtru schimbat repornește paginarea, altfel un offset vechi dă o pagină goală.
  useEffect(() => {
    setPage(0);
  }, [search, stage, segment, icp, city, sort]);

  function closeDetail() {
    setActiveId(null);
    if (searchParams.get('lead')) router.replace('/pipeline', { scroll: false });
  }

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
    search.trim() !== '' || stage !== 'all' || segment !== 'all' || icp !== 'all' || city !== 'all';

  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Pipeline leaduri</h1>
        <p className="text-sm text-stone-500">
          Lead-urile găsite și calificate de motorul de leaduri (și cele importate), cu etapa de outreach la zi.
          Deschide un lead ca să vezi semnalele, auditul, mesajele generate și istoricul.
        </p>
      </div>

      <EnginePanel onChanged={fetchLeads} />
      <OutreachPanel />

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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Caută după firmă, domeniu, oraș, nișă sau email..."
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
        {stageOptions.length > 1 && (
          <OptionRow label="Etapă" options={stageOptions} selected={stage} onSelect={setStage} />
        )}
        {facets.segments.length > 0 && (
          <OptionRow
            label="Segment"
            options={[{ value: 'all', label: 'Toate' }, ...facets.segments.map((s) => ({ value: s, label: s }))]}
            selected={segment}
            onSelect={setSegment}
          />
        )}
        <OptionRow label="ICP" options={ICP_OPTIONS} selected={icp} onSelect={setIcp} />
        {facets.cities.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-stone-100 uppercase tracking-[0.15em] font-medium w-16 shrink-0">
              Oraș
            </span>
            <CategoryFilter categories={facets.cities} selected={city} onSelect={setCity} />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <OptionRow label="Sortare" options={SORT_OPTIONS} selected={sort} onSelect={setSort} />
          {!loading && (
            <span className="text-xs text-stone-600 shrink-0">
              {total} {total === 1 ? 'lead' : 'lead-uri'}
              {hasFilters ? ' potrivite' : ''}
            </span>
          )}
        </div>
      </div>

      <PipelineTable
        leads={leads}
        loading={loading}
        onOpen={(lead) => setActiveId(lead.id)}
        emptyMessage={
          hasFilters
            ? 'Niciun lead pentru filtrele curente.'
            : 'Niciun lead din pipeline încă. Lead-urile apar aici după rulările motorului sau după un import.'
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

/** Rând de chips cu etichete diferite de valori (la fel ca în /leads). */
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
