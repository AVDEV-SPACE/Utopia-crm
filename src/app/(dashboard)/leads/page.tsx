'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { ImportForm } from '@/components/leads/ImportForm';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailDialog, LeadDialogTab } from '@/components/leads/LeadDetailDialog';
import { CategoryFilter } from '@/components/leads/CategoryFilter';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';
import { Button } from '@/components/ui/button';
import { Lead } from '@/services/leads/types';
import type { PitchSummary } from '@/services/messages/repository';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

/** Etichete pentru sursele stocate în `leads.source`. */
const SOURCE_LABELS: Record<string, string> = {
  sheet: 'Google Sheet',
  crm: 'Lead Generation',
  missed_call: 'Apel pierdut',
  website: 'Site',
};

interface Option {
  value: string;
  label: string;
}

/** Praguri pe nota Google (0–5). */
const RATING_OPTIONS: Option[] = [
  { value: 'all', label: 'Toate' },
  { value: '4.5', label: '★ 4.5+' },
  { value: '4', label: '★ 4+' },
  { value: '3', label: '★ 3+' },
  { value: 'none', label: 'Fără rating' },
];

/** Intervale pe scorul PageSpeed (0–100). */
const SCORE_OPTIONS: Option[] = [
  { value: 'all', label: 'Toate' },
  { value: '70', label: '70+' },
  { value: '40', label: '40+' },
  { value: 'lt40', label: 'sub 40' },
  { value: 'none', label: 'Fără scor' },
];

interface Facets {
  locations: string[];
  niches: string[];
  categories: string[];
  sources: string[];
}

export default function LeadsPage() {
  // `useSearchParams` are nevoie de o graniță Suspense la randare
  return (
    <Suspense fallback={null}>
      <LeadsContent />
    </Suspense>
  );
}

function LeadsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<Facets>({ locations: [], niches: [], categories: [], sources: [] });
  const [pitched, setPitched] = useState<Record<string, PitchSummary>>({});
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<LeadDialogTab>('details');

  const [search, setSearch] = useState('');
  const [source, setSource] = useState('all');
  const [location, setLocation] = useState('all');
  const [niche, setNiche] = useState('all');
  const [category, setCategory] = useState('all');
  const [rating, setRating] = useState('all');
  const [score, setScore] = useState('all');
  const [page, setPage] = useState(0);
  // Deep-link din cardul „Pitched” de pe Overview: /leads?view=pitched
  const [showPitched, setShowPitched] = useState(() => searchParams.get('view') === 'pitched');

  // Căutarea merge pe server, deci fiecare tastă ar declanșa un request. Ținem
  // ultimul controller ca să anulăm răspunsurile depășite — altfel un răspuns
  // lent pentru „den” poate ateriza după cel pentru „dental” și suprascrie lista.
  const inFlight = useRef<AbortController | null>(null);

  const fetchLeads = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const params = new URLSearchParams({
      meta: '1',
      facets: '1',
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (search.trim()) params.set('q', search.trim());
    if (source !== 'all') params.set('source', source);
    if (location !== 'all') params.set('location', location);
    if (niche !== 'all') params.set('niche', niche);
    if (category !== 'all') params.set('category', category);
    if (rating !== 'all') params.set('rating', rating);
    // „sub 40” e o limită superioară, restul opțiunilor sunt praguri minime
    if (score === 'lt40') params.set('scoreMax', '39');
    else if (score !== 'all') params.set('score', score);

    try {
      const res = await fetch(`/api/leads?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Nu am putut încărca lead-urile');
      const data = await res.json();
      setLeads(data.leads as Lead[]);
      setTotal(data.total as number);
      setPitched((data.pitched ?? {}) as Record<string, PitchSummary>);
      if (data.facets) setFacets(data.facets as Facets);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error(err);
      toast.error('Eroare la încărcarea lead-urilor');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [search, source, location, niche, category, rating, score, page]);

  // Debounce pe căutare; filtrele și paginarea se aplică imediat.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(fetchLeads, search.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchLeads, search]);

  // Orice schimbare de filtru sau de căutare repornește paginarea de la început,
  // altfel un offset rămas de la o listă mai lungă ar arăta o pagină goală.
  useEffect(() => {
    setPage(0);
  }, [search, source, location, niche, category, rating, score]);

  // Deep-link din bara de căutare a headerului: /leads?lead=<id>
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (!leadId) return;

    (async () => {
      const res = await fetch(`/api/leads/${leadId}`);
      if (!res.ok) return;
      setActiveTab('details');
      setActiveLead((await res.json()) as Lead);
      router.replace('/leads', { scroll: false });
    })();
  }, [searchParams, router]);

  async function handleGeneratePitch(lead: Lead) {
    setGeneratingId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/pitch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la generarea pitch-ului');

      const updatedLead = data.lead as Lead;
      setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
      setActiveLead(updatedLead);
      toast.success('Pitch generat — revizuiește-l înainte de trimitere.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la generarea pitch-ului');
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleDeleteLead(lead: Lead) {
    // Ștergerea e definitivă și nu are „undo", deci cerem o confirmare explicită
    const ok = window.confirm(
      `Ștergi definitiv lead-ul „${lead.company_name}"?

Dispar și notele lui din istoric. Acțiunea nu poate fi anulată.`
    );
    if (!ok) return;

    setDeletingId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Eroare la ștergere');

      // Scoatem rândul imediat, apoi resincronizăm totalul și fațetele
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      setTotal((prev) => Math.max(prev - 1, 0));
      if (activeLead?.id === lead.id) setActiveLead(null);
      toast.success(`Lead-ul „${lead.company_name}" a fost șters.`);
      fetchLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la ștergere');
    } finally {
      setDeletingId(null);
    }
  }

  function handleLeadUpdated(updated: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setActiveLead(updated);
  }

  /** Orice filtru schimbat închide vizualizarea „Pitched”, care ignoră filtrele. */
  const applyFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setShowPitched(false);
  };

  const hasFilters =
    search.trim() !== '' ||
    source !== 'all' ||
    location !== 'all' ||
    niche !== 'all' ||
    category !== 'all' ||
    rating !== 'all' ||
    score !== 'all';

  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Leads</h1>
        <p className="text-sm text-stone-500">
          Toate lead-urile la un loc — cele importate din Google Sheets și cele găsite
          prin scanare în Lead Generation. Filtrează după sursă, rating sau scor și vezi
          prin ce canal a fost contactat fiecare.
        </p>
      </div>

      <ImportForm
        onImported={() => {
          setPage(0);
          fetchLeads();
        }}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" size={15} />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowPitched(false); }}
          placeholder="Caută lead după nume, oraș, telefon sau email..."
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
            options={[
              { value: 'all', label: 'Toate' },
              ...facets.sources.map((s) => ({ value: s, label: SOURCE_LABELS[s] ?? s })),
            ]}
            selected={source}
            onSelect={applyFilter(setSource)}
          />
        )}
        <OptionRow label="Rating" options={RATING_OPTIONS} selected={rating} onSelect={applyFilter(setRating)} />
        <OptionRow label="Scor" options={SCORE_OPTIONS} selected={score} onSelect={applyFilter(setScore)} />

        {facets.locations.length > 0 && (
          <FilterRow label="Oraș" values={facets.locations} selected={location} onSelect={applyFilter(setLocation)} />
        )}
        {facets.niches.length > 0 && (
          <FilterRow label="Nișă" values={facets.niches} selected={niche} onSelect={applyFilter(setNiche)} />
        )}
        {facets.categories.length > 0 && (
          <FilterRow label="Categorie" values={facets.categories} selected={category} onSelect={applyFilter(setCategory)} />
        )}

        <div className="flex items-center gap-2 pt-1">
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

          {!showPitched && !loading && (
            <span className="text-xs text-stone-600">
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
          <LeadsTable
            leads={leads}
            loading={loading}
            generatingId={generatingId}
            showRating
            showSource
            pitched={pitched}
            onGeneratePitch={handleGeneratePitch}
            onOpenPitch={(lead) => { setActiveTab('pitch'); setActiveLead(lead); }}
            onOpenDetails={(lead) => { setActiveTab('details'); setActiveLead(lead); }}
            onOpenMessages={(lead) => { setActiveTab('messages'); setActiveLead(lead); }}
            onDelete={handleDeleteLead}
            deletingId={deletingId}
            onWhatsAppOpened={fetchLeads}
            emptyMessage={
              hasFilters
                ? 'Niciun lead pentru filtrele curente.'
                : 'Niciun lead încă. Importă un Google Sheet mai sus sau scanează o nișă în Lead Generation.'
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

      {activeLead && (
        <LeadDetailDialog
          lead={activeLead}
          initialTab={activeTab}
          onClose={() => setActiveLead(null)}
          onUpdated={handleLeadUpdated}
        />
      )}
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

/** Rând de chips cu etichete diferite de valori (praguri, surse). */
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
