'use client';

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { ScanForm } from '@/components/leads/ScanForm';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { LeadDetailDialog, LeadDialogTab } from '@/components/leads/LeadDetailDialog';
import { CategoryFilter } from '@/components/leads/CategoryFilter';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';
import { Lead } from '@/services/leads/types';

export const dynamic = 'force-dynamic';

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
  const searchParams = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<LeadDialogTab>('details');
  const [selectedNiche, setSelectedNiche] = useState('all');
  const [search, setSearch] = useState('');
  // 'pitched' comută lista de lead-uri pe jurnalul mesajelor/mail-urilor trimise
  const [showPitched, setShowPitched] = useState(false);

  const nicheCategories = useMemo(
    () => Array.from(new Set(leads.map((l) => l.niche).filter((n): n is string => !!n))).sort(),
    [leads]
  );

  // Căutarea e locală: lead-urile sunt deja încărcate, deci rezultatele apar instant
  const filteredLeads = useMemo(() => {
    const byNiche = selectedNiche === 'all' ? leads : leads.filter((l) => l.niche === selectedNiche);
    const q = search.trim().toLowerCase();
    if (!q) return byNiche;
    return byNiche.filter((l) =>
      [l.company_name, l.contact_email, l.contact_phone, l.contact_instagram, l.website, l.niche, l.location]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(q))
    );
  }, [leads, selectedNiche, search]);

  const fetchLeads = useCallback(async () => {
    try {
      // Lead-urile importate din spreadsheet au pagina lor (/leads); aici rămân
      // doar cele produse de scanare și de automatizări.
      const res = await fetch('/api/leads?excludeSource=sheet');
      if (!res.ok) throw new Error('Nu am putut încărca lead-urile');
      setLeads(await res.json());
    } catch (err) {
      console.error(err);
      toast.error('Eroare la încărcarea lead-urilor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Deep-link din bara de căutare a headerului: /lead-generation?lead=<id>
  // deschide direct fișa lead-ului, apoi curăță parametrul din URL.
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (!leadId || leads.length === 0) return;
    const match = leads.find((l) => l.id === leadId);
    if (!match) return;
    setActiveTab('details');
    setActiveLead(match);
    router.replace('/lead-generation', { scroll: false });
  }, [searchParams, leads, router]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title text-stone-100">Lead Generation</h1>
        <p className="text-sm text-stone-500">
          Scanează firme dintr-o nișă/locație, scorează calitatea site-ului lor și generează pitch-uri personalizate.
        </p>
      </div>

      <ScanForm onScan={handleScan} loading={scanning} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" size={15} />
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowPitched(false); }}
          placeholder="Caută lead după nume, email, telefon, website sau locație..."
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

      <div className="flex flex-wrap items-center gap-1.5">
        {nicheCategories.length > 0 && (
          <CategoryFilter
            categories={nicheCategories}
            selected={selectedNiche}
            onSelect={(niche) => {
              setSelectedNiche(niche);
              setShowPitched(false);
            }}
          />
        )}

        {nicheCategories.length > 0 && <span className="w-px h-4 bg-stone-800 mx-1" />}

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

      {showPitched ? (
        <SentMessagesTable
          recipientType="lead"
          emptyMessage="Niciun pitch trimis încă. Mesajele și mail-urile trimise către lead-uri apar aici."
        />
      ) : (
        <LeadsTable
          leads={filteredLeads}
          loading={loading}
          generatingId={generatingId}
          onGeneratePitch={handleGeneratePitch}
          onOpenPitch={(lead) => { setActiveTab('pitch'); setActiveLead(lead); }}
          onOpenDetails={(lead) => { setActiveTab('details'); setActiveLead(lead); }}
          onWhatsAppOpened={fetchLeads}
          emptyMessage={
            search.trim()
              ? `Niciun lead pentru căutarea „${search.trim()}”.`
              : selectedNiche !== 'all'
              ? `Niciun lead pentru nișa „${selectedNiche}”.`
              : undefined
          }
        />
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
