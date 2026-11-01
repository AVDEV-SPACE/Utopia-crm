'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Link as LinkIcon, Copy, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LeadComposer } from '@/components/messages/LeadComposer';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Lead, LeadStatus } from '@/services/leads/types';
import { LeadDetailsForm } from './LeadDetailsForm';
import { LeadNotesPanel } from './LeadNotesPanel';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';

const STATUS_OPTIONS: LeadStatus[] = [
  'new', 'scored', 'pitch_ready', 'sent', 'replied', 'negotiating', 'won', 'lost',
];

export type LeadDialogTab = 'details' | 'pitch' | 'history' | 'messages';

const TABS: { value: LeadDialogTab; label: string }[] = [
  { value: 'details', label: 'Detalii' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'history', label: 'Istoric' },
  { value: 'messages', label: 'Mesaje trimise' },
];

interface LeadDetailDialogProps {
  lead: Lead;
  initialTab?: LeadDialogTab;
  onClose: () => void;
  onUpdated: (lead: Lead) => void;
  /** Generează pitch-ul AI (tab-ul Pitch, când lead-ul nu are încă unul). */
  onGeneratePitch?: (lead: Lead) => void;
  generating?: boolean;
  /** Șterge definitiv lead-ul. Apelantul cere confirmarea. */
  onDelete?: (lead: Lead) => void;
  deleting?: boolean;
}

/** Fișa unui lead, ca panou lateral: detalii editabile, pitch și trimitere, istoric, mesaje. */
export function LeadDetailDialog({
  lead,
  initialTab = 'details',
  onClose,
  onUpdated,
  onGeneratePitch,
  generating = false,
  onDelete,
  deleting = false,
}: LeadDetailDialogProps) {
  const [tab, setTab] = useState<LeadDialogTab>(initialTab);

  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [amountEur, setAmountEur] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  // După o trimitere, statusul lead-ului se schimbă pe server
  useEffect(() => setStatus(lead.status), [lead.status]);

  /** Recitește lead-ul după o trimitere sau o salvare din compozitor. */
  async function refresh() {
    try {
      const res = await fetch(`/api/leads/${lead.id}`);
      if (res.ok) onUpdated((await res.json()) as Lead);
    } catch {
      // Lista se reîncarcă oricum la închiderea fișei
    }
  }

  async function patchLead(patch: Record<string, unknown>) {
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Eroare la actualizare');
    return data as Lead;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await patchLead({ status });
      onUpdated(updated);
      toast.success('Status actualizat.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreatePaymentLink() {
    const amount = Number(amountEur);
    if (!amount || amount <= 0) {
      toast.error('Introdu o sumă validă în EUR.');
      return;
    }
    setCreatingLink(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountEur: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la generarea link-ului');
      onUpdated(data.lead as Lead);
      toast.success('Link de plată generat.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la generarea link-ului');
    } finally {
      setCreatingLink(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl bg-stone-900 border-stone-800/60 text-stone-100 overflow-y-auto gap-0"
      >
        <SheetHeader className="border-b border-stone-800/60 pr-12">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-stone-100 truncate">{lead.company_name}</SheetTitle>
              <SheetDescription className="text-stone-500">
                {[lead.niche, lead.location].filter(Boolean).join(' · ') || 'fără nișă/locație'}
              </SheetDescription>
            </div>
            {onDelete && (
              <Button
                size="sm"
                variant="outline"
                title="Șterge lead-ul"
                disabled={deleting}
                onClick={() => onDelete(lead)}
                className="shrink-0 text-red-400 hover:text-red-300 hover:border-red-500/40"
              >
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Șterge
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="p-4">

        {/* Tab-uri */}
        <div className="flex gap-1.5 mb-5">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                tab === t.value
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'details' && <LeadDetailsForm lead={lead} onUpdated={onUpdated} />}

        {tab === 'history' && <LeadNotesPanel leadId={lead.id} />}

        {tab === 'messages' && (
          <SentMessagesTable
            leadId={lead.id}
            emptyMessage="Niciun mesaj trimis către acest lead."
          />
        )}

        {tab === 'pitch' && (
          <>
            {!lead.pitch_generated && onGeneratePitch && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-stone-800/60 bg-stone-950/40 px-3 py-2">
                <p className="flex-1 text-xs text-stone-500">Lead-ul nu are încă un pitch AI.</p>
                <Button size="sm" variant="outline" disabled={generating} onClick={() => onGeneratePitch(lead)}>
                  {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  Generează pitch
                </Button>
              </div>
            )}
            {/* Canal, template / pitch AI, editare, ajustare AI, trimitere */}
            <LeadComposer lead={lead} onChanged={refresh} />

            <div className="mt-5 flex items-end gap-3 border-t border-stone-800/60 pt-4">
              <div className="flex-1">
                <Label className="text-xs text-stone-500 mb-1.5 block">Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as LeadStatus)}
                  className="w-full h-9 rounded-md border border-stone-800 bg-stone-950/60 px-3 text-sm text-stone-200"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" disabled={saving || status === lead.status} onClick={handleSave}>
                {saving ? <Loader2 className="animate-spin" /> : null} Salvează statusul
              </Button>
            </div>

            <div className="mt-6 border-t border-stone-800/60 pt-4">
              <p className="text-xs text-stone-500 mb-2">
                Link de plată — disponibil doar când status-ul e{' '}
                <span className="text-stone-300">negotiating</span> și prețul a fost confirmat manual
                în urma discuției de consultanță.
              </p>
              {lead.payment_link ? (
                <div className="flex items-center gap-2 bg-stone-950/60 border border-stone-800 rounded-lg p-2">
                  <LinkIcon size={14} className="text-amber-400 shrink-0" />
                  <span className="text-xs text-stone-300 truncate flex-1">{lead.payment_link}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(lead.payment_link!);
                      toast.success('Link copiat.');
                    }}
                    className="text-stone-500 hover:text-stone-300"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Sumă (EUR)"
                    value={amountEur}
                    onChange={(e) => setAmountEur(e.target.value)}
                    disabled={status !== 'negotiating'}
                  />
                  <Button
                    variant="outline"
                    disabled={creatingLink || status !== 'negotiating'}
                    onClick={handleCreatePaymentLink}
                  >
                    {creatingLink ? <Loader2 className="animate-spin" /> : <LinkIcon />}
                    Generează link plată
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
