'use client';

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ScanForm } from '@/components/leads/ScanForm';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailDialog, LeadDialogTab } from '@/components/leads/LeadDetailDialog';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';
import { Tabs } from '@/components/motion/Tabs';
import { SegmentedControl } from '@/components/motion/SegmentedControl';
import {
  ALL,
  ActiveFilterChips,
  FilterSelect,
  SearchField,
  type ActiveChip,
  type FilterOption,
} from '@/components/filters/FilterControls';
import { displayDomain } from '@/components/leads/badges';
import { Lead } from '@/services/leads/types';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { useUrlFilters, withoutParam } from '@/hooks/use-url-filters';
import { fetchJson, peek } from '@/lib/data-cache';
import { PAGE_DATA } from '@/lib/navConfig';

export const dynamic = 'force-dynamic';

const REFRESH_MS = 30_000;

// ── Filtre ────────────────────────────────────────────────────────────────
/** Grupurile de status din tab-uri; statusurile automatizărilor intră la „Nou”. */
type StatusGroup = 'new' | 'scored' | 'pitch_ready' | 'sent' | 'replied';

const STATUS_TABS: { value: 'all' | StatusGroup; label: string }[] = [
  { value: 'all', label: 'Toate' },
  { value: 'new', label: 'Nou' },
  { value: 'scored', label: 'Scorat' },
  { value: 'pitch_ready', label: 'Pitch gata' },
  { value: 'sent', label: 'Trimis' },
  { value: 'replied', label: 'Răspuns' },
];

function statusGroup(status: string): StatusGroup {
  switch (status) {
    case 'scored':
    case 'pitch_ready':
    case 'sent':
      return status;
    case 'replied':
    case 'negotiating':
    case 'won':
    case 'lost':
      return 'replied';
    default:
      return 'new';
  }
}

const SCORE_OPTIONS: FilterOption[] = [
  { value: '80', label: '80+' },
  { value: '70', label: '70+' },
  { value: '40', label: '40+' },
  { value: 'lt40', label: 'sub 40' },
  { value: 'none', label: 'Fără scor' },
];

const CHANNEL_OPTIONS: FilterOption[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Telefon' },
  { value: 'instagram', label: 'Instagram' },
];

const SORT_OPTIONS: FilterOption[] = [
  { value: 'date', label: 'Cele mai noi' },
  { value: 'score', label: 'Scor ↓' },
  { value: 'name', label: 'Nume' },
];

const FILTER_DEFAULTS = {
  view: 'leads',
  q: '',
  status: ALL,
  niche: ALL,
  loc: ALL,
  score: ALL,
  channel: ALL,
  sort: 'date',
} as const;

type FilterKey = keyof typeof FILTER_DEFAULTS;

function matchesScore(score: number | null, filter: string): boolean {
  if (filter === ALL) return true;
  if (filter === 'none') return score === null;
  if (score === null) return false;
  if (filter === 'lt40') return score < 40;
  return score >= Number(filter);
}

function matchesChannel(lead: Lead, filter: string): boolean {
  switch (filter) {
    case 'whatsapp':
    case 'phone':
      return !!lead.contact_phone;
    case 'email':
      return !!lead.contact_email;
    case 'instagram':
      return !!lead.contact_instagram;
    default:
      return true;
  }
}

/** Lead-urile care au același domeniu sau același telefon cu altul din listă. */
function findDuplicates(leads: Lead[]): Set<string> {
  const byKey = new Map<string, string[]>();
  const add = (key: string, id: string) => byKey.set(key, [...(byKey.get(key) ?? []), id]);
  for (const lead of leads) {
    if (lead.website) add(`d:${displayDomain(lead.website).toLowerCase()}`, lead.id);
    const phone = lead.contact_phone?.replace(/\D/g, '').slice(-9);
    if (phone && phone.length >= 9) add(`p:${phone}`, lead.id);
  }
  const dupes = new Set<string>();
  byKey.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => dupes.add(id));
  });
  return dupes;
}

const countBy = <T,>(items: T[], key: (item: T) => string | null | undefined) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'ro'))
    .map(([value, count]) => ({ value, label: value, count }));
};

export default function LeadGenerationPage() {
  // `useSearchParams` are nevoie de o graniță Suspense la randare
  return (
    <Suspense fallback={null}>
      <LeadGenerationContent />
    </Suspense>
  );
}

function LeadGenerationContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Din cache (vizită anterioară sau preload la hover pe sidebar): lista apare instant,
  // iar fetch-ul de mai jos o reîmprospătează în fundal. Skeleton doar la prima vizită.
  const [leads, setLeads] = useState<Lead[]>(() => peek<Lead[]>(PAGE_DATA.leadGeneration) ?? []);
  const [loading, setLoading] = useState(() => !peek(PAGE_DATA.leadGeneration));
  const [scanning, setScanning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<LeadDialogTab>('details');
  const { values: f, set, reset } = useUrlFilters<FilterKey>(FILTER_DEFAULTS);

  // Opțiunile dropdown-urilor vin din lead-urile încărcate, cu numărătoare
  const nicheOptions = useMemo(() => countBy(leads, (l) => l.niche), [leads]);
  const locationOptions = useMemo(() => countBy(leads, (l) => l.location), [leads]);
  const duplicates = useMemo(() => findDuplicates(leads), [leads]);

  // Toate filtrele în afară de status — numărătorile din tab-uri le respectă
  const baseFiltered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    return leads.filter(
      (l) =>
        (f.niche === ALL || l.niche === f.niche) &&
        (f.loc === ALL || l.location === f.loc) &&
        matchesScore(l.score, f.score) &&
        matchesChannel(l, f.channel) &&
        (!q ||
          [l.company_name, l.contact_email, l.contact_phone, l.contact_instagram, l.website, l.niche, l.location]
            .filter(Boolean)
            .some((field) => (field as string).toLowerCase().includes(q)))
    );
  }, [leads, f.q, f.niche, f.loc, f.score, f.channel]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: baseFiltered.length };
    for (const l of baseFiltered) {
      const g = statusGroup(l.status);
      counts[g] = (counts[g] ?? 0) + 1;
    }
    return counts;
  }, [baseFiltered]);

  const visibleLeads = useMemo(() => {
    const list = f.status === ALL ? baseFiltered : baseFiltered.filter((l) => statusGroup(l.status) === f.status);
    if (f.sort === 'score') return [...list].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    if (f.sort === 'name') return [...list].sort((a, b) => a.company_name.localeCompare(b.company_name, 'ro'));
    return list;
  }, [baseFiltered, f.status, f.sort]);

  // `quiet`: reîncărcare în fundal — o eroare trecătoare nu afișează toast la fiecare tur
  const fetchLeads = useCallback(async (quiet = false) => {
    try {
      // Lead-urile importate din spreadsheet au pagina lor (/leads), cele ale
      // motorului și importurile CSV au /pipeline; aici rămân
      // doar cele produse de scanare și de automatizări.
      setLeads(await fetchJson<Lead[]>(PAGE_DATA.leadGeneration));
    } catch (err) {
      console.error(err);
      if (!quiet) toast.error('Eroare la încărcarea lead-urilor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Lead-urile adăugate de automatizări și scorurile/pitch-urile noi apar fără refresh
  useLiveRefresh(useCallback(() => fetchLeads(true), [fetchLeads]), REFRESH_MS);

  // Deep-link din bara de căutare a headerului: /lead-generation?lead=<id>
  // deschide direct fișa lead-ului, apoi curăță doar acel parametru (filtrele rămân).
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (!leadId || leads.length === 0) return;
    const match = leads.find((l) => l.id === leadId);
    if (!match) return;
    setActiveTab('details');
    setActiveLead(match);
    router.replace(withoutParam(pathname, 'lead'), { scroll: false });
  }, [searchParams, leads, router, pathname]);

  async function handleScan(niche: string, location: string, radiusKm: number) {
    setScanning(true);
    try {
      const res = await fetch('/api/leads/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, location, radius_km: radiusKm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la scanare');

      const newLeads = (data.leads ?? []) as Lead[];
      toast.success(`${newLeads.length} lead-uri găsite și scorate.`);

      // Actualizează imediat din răspuns, nu doar prin refetch separat
      setLeads((prev) => {
        const existingIds = new Set(prev.map((l) => l.id));
        return [...newLeads.filter((l) => !existingIds.has(l.id)), ...prev];
      });

      fetchLeads();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la scanare');
    } finally {
      setScanning(false);
    }
  }

  async function handleGeneratePitch(lead: Lead) {
    setGeneratingId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/pitch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la generarea pitch-ului');

      const updatedLead = data.lead as Lead;
      setLeads((prev) => prev.map((l) => (l.id === updatedLead.id ? updatedLead : l)));
      setActiveTab('pitch');
      setActiveLead(updatedLead);
      toast.success('Pitch generat — revizuiește-l înainte de trimitere.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la generarea pitch-ului');
    } finally {
      setGeneratingId(null);
    }
  }

  function handleLeadUpdated(updated: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setActiveLead(updated);
  }

  const open = (tab: LeadDialogTab) => (lead: Lead) => {
    setActiveTab(tab);
    setActiveLead(lead);
  };

  const label = (options: FilterOption[], value: string) => options.find((o) => o.value === value)?.label ?? value;
  const chips: ActiveChip[] = [
    f.q.trim() && { key: 'q', label: `„${f.q.trim()}”`, onRemove: () => set('q', '') },
    f.niche !== ALL && { key: 'niche', label: `Nișă: ${f.niche}`, onRemove: () => set('niche', ALL) },
    f.loc !== ALL && { key: 'loc', label: `Locație: ${f.loc}`, onRemove: () => set('loc', ALL) },
    f.score !== ALL && { key: 'score', label: `Scor: ${label(SCORE_OPTIONS, f.score)}`, onRemove: () => set('score', ALL) },
    f.channel !== ALL && { key: 'channel', label: `Canal: ${label(CHANNEL_OPTIONS, f.channel)}`, onRemove: () => set('channel', ALL) },
  ].filter(Boolean) as ActiveChip[];

  const showLog = f.view === 'log';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Lead Generation</h1>
        <p className="text-sm text-stone-500">
          Scanează firme dintr-o nișă/locație, scorează calitatea site-ului lor și generează pitch-uri personalizate.
        </p>
      </div>

      <ScanForm onScan={handleScan} loading={scanning} />

      {/* Bara de filtre: rămâne vizibilă la scroll, sub header */}
      <section className="filter-bar sticky top-0 z-20 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            aria-label="Vizualizare"
            value={showLog ? 'log' : 'leads'}
            onChange={(v) => set('view', v)}
            options={[
              { value: 'leads', label: 'Lead-uri' },
              { value: 'log', label: 'Jurnal trimiteri' },
            ]}
          />
          {!showLog && (
            <SearchField
              value={f.q}
              onChange={(v) => set('q', v)}
              placeholder="Caută după nume, email, telefon, website sau locație..."
              className="flex-1 min-w-[220px]"
            />
          )}
        </div>

        {!showLog && (
          <>
            <Tabs
              aria-label="Status"
              value={f.status}
              onChange={(v) => set('status', v)}
              tabs={STATUS_TABS.map((t) => ({ ...t, count: statusCounts[t.value] ?? 0 }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect label="Nișă" value={f.niche} options={nicheOptions} onChange={(v) => set('niche', v)} />
              <FilterSelect label="Locație" value={f.loc} options={locationOptions} onChange={(v) => set('loc', v)} />
              <FilterSelect label="Scor" value={f.score} options={SCORE_OPTIONS} onChange={(v) => set('score', v)} />
              <FilterSelect label="Canal" value={f.channel} options={CHANNEL_OPTIONS} onChange={(v) => set('channel', v)} allLabel="Oricare" />
              <span className="hidden sm:block w-px h-5 bg-[var(--card-border)] mx-1" />
              <FilterSelect label="Sortare" value={f.sort} options={SORT_OPTIONS} onChange={(v) => set('sort', v)} hideAll />
              {!loading && (
                <span className="ml-auto text-xs text-stone-500 tabular-nums">
                  {visibleLeads.length} {visibleLeads.length === 1 ? 'lead' : 'lead-uri'}
                </span>
              )}
            </div>
            <ActiveFilterChips chips={chips} onReset={() => reset(['view', 'sort'])} />
          </>
        )}
      </section>

      {showLog ? (
        <SentMessagesTable
          recipientType="lead"
          emptyMessage="Niciun pitch trimis încă. Mesajele și mail-urile trimise către lead-uri apar aici."
        />
      ) : (
        <LeadsTable
          leads={visibleLeads}
          loading={loading}
          generatingId={generatingId}
          duplicateIds={duplicates}
          onGeneratePitch={handleGeneratePitch}
          onOpenPitch={open('pitch')}
          onOpenDetails={open('details')}
          onOpenMessages={open('messages')}
          onWhatsAppOpened={fetchLeads}
          emptyMessage={
            chips.length || f.status !== ALL
              ? 'Niciun lead pentru filtrele curente.'
              : undefined
          }
        />
      )}

      {activeLead && (
        <LeadDetailDialog
          key={`${activeLead.id}-${activeTab}`}
          lead={activeLead}
          initialTab={activeTab}
          onClose={() => setActiveLead(null)}
          onUpdated={handleLeadUpdated}
          onGeneratePitch={handleGeneratePitch}
          generating={generatingId === activeLead.id}
        />
      )}
    </div>
  );
}
