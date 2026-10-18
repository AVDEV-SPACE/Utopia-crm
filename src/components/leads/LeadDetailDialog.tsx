'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { X, Send, Loader2, Link as LinkIcon, Copy, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatWhatsAppLink } from '@/lib/utils';
import { logWhatsAppSend } from '@/lib/sent-messages-client';
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
}

export function LeadDetailDialog({
  lead,
  initialTab = 'details',
  onClose,
  onUpdated,
}: LeadDetailDialogProps) {
  const [tab, setTab] = useState<LeadDialogTab>(initialTab);

  const [pitch, setPitch] = useState(lead.pitch_generated ?? '');
  const [subject, setSubject] = useState(lead.pitch_subject ?? '');
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [amountEur, setAmountEur] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  const canAutoSend = Boolean(lead.contact_email || lead.contact_phone);

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
      const updated = await patchLead({ pitch_generated: pitch, pitch_subject: subject, status });
      onUpdated(updated);
      toast.success('Lead actualizat.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendNow() {
    setSending(true);
    try {
      await patchLead({ pitch_generated: pitch, pitch_subject: subject });
      const res = await fetch(`/api/leads/${lead.id}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la trimitere');
      setStatus('sent');
      onUpdated(data.lead as Lead);
      toast.success(`Pitch trimis prin ${lead.contact_email ? 'email' : 'SMS'}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la trimitere');
    } finally {
      setSending(false);
    }
  }

  async function handleMarkSent() {
    setSaving(true);
    try {
      const updated = await patchLead({ status: 'sent' });
      setStatus('sent');
      onUpdated(updated);
      toast.success('Marcat ca trimis.');
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-stone-100 truncate">{lead.company_name}</h2>
            <p className="text-xs text-stone-500">
              {[lead.niche, lead.location].filter(Boolean).join(' · ') || 'fără nișă/locație'}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 shrink-0">
            <X size={20} />
          </button>
        </div>

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
            {lead.pitch_channel === 'email' && (
              <div className="mb-4">
                <Label className="text-xs text-stone-500 mb-1.5 block">Subiect email (hook)</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subiect generat automat pe baza celei mai relevante probleme"
                />
              </div>
            )}

            <Label className="text-xs text-stone-500 mb-1.5 block">
              Pitch generat (editabil înainte de trimitere)
            </Label>
            <textarea
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              rows={6}
              placeholder="Niciun pitch generat încă — îl poți scrie manual aici."
              className="w-full rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />

            <div className="mt-4 flex items-center gap-3">
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
              <div className="flex flex-wrap gap-2 pt-5">
                <Button variant="outline" disabled={saving || sending} onClick={handleSave}>
                  {saving ? <Loader2 className="animate-spin" /> : null} Salvează
                </Button>
                {lead.contact_phone && (
                  <Button
                    variant="outline"
                    disabled={!pitch.trim()}
                    onClick={() => {
                      window.open(formatWhatsAppLink(lead.contact_phone!, pitch), '_blank');
                      logWhatsAppSend(lead, pitch);
                    }}
                  >
                    <MessageCircle /> WhatsApp
                  </Button>
                )}
                <Button
                  disabled={saving || sending || !canAutoSend || !pitch.trim()}
                  title={!canAutoSend ? 'Lead-ul nu are email sau telefon — trimite manual' : undefined}
                  onClick={handleSendNow}
                >
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                  Trimite acum ({lead.contact_email ? 'Email' : lead.contact_phone ? 'SMS' : 'manual'})
                </Button>
                <Button variant="outline" disabled={saving || sending} onClick={handleMarkSent}>
                  Marchează ca trimis manual
                </Button>
              </div>
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
    </div>
  );
}
