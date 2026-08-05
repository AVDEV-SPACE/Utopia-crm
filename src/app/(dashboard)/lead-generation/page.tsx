'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { ScanForm } from '@/components/leads/ScanForm';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { PitchEditorDialog } from '@/components/leads/PitchEditorDialog';
import { CategoryFilter } from '@/components/leads/CategoryFilter';
import { Lead } from '@/services/leads/types';

export const dynamic = 'force-dynamic';

export default function LeadGenerationPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [selectedNiche, setSelectedNiche] = useState('all');

  const nicheCategories = useMemo(
    () => Array.from(new Set(leads.map((l) => l.niche).filter((n): n is string => !!n))).sort(),
    [leads]
  );

  const filteredLeads = useMemo(
    () => (selectedNiche === 'all' ? leads : leads.filter((l) => l.niche === selectedNiche)),
    [leads, selectedNiche]
  );

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/leads');
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
        <h1 className="text-xl font-semibold text-stone-100">Lead Generation</h1>
        <p className="text-sm text-stone-500">
          Scanează firme dintr-o nișă/locație, scorează calitatea site-ului lor și generează pitch-uri personalizate.
        </p>
      </div>

      <ScanForm onScan={handleScan} loading={scanning} />

      {nicheCategories.length > 0 && (
        <CategoryFilter categories={nicheCategories} selected={selectedNiche} onSelect={setSelectedNiche} />
      )}

      <LeadsTable
        leads={filteredLeads}
        loading={loading}
        generatingId={generatingId}
        onGeneratePitch={handleGeneratePitch}
        onOpenPitch={(lead) => setActiveLead(lead)}
        emptyMessage={
          selectedNiche !== 'all' ? `Niciun lead pentru nișa „${selectedNiche}”.` : undefined
        }
      />

      {activeLead && (
        <PitchEditorDialog
          lead={activeLead}
          onClose={() => setActiveLead(null)}
          onUpdated={handleLeadUpdated}
        />
      )}
    </div>
  );
}
