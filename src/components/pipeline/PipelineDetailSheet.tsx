'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Check, Pencil, X, Trash2, Sparkles, Link as LinkIcon, Copy } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Lead } from '@/services/leads/types';
import type { PipelineEvent, PipelineScoreDetails } from '@/services/pipeline/types';
import { PIPELINE_STAGES, STAGE_LABELS } from '@/services/pipeline/stages';
import { LeadComposer } from '@/components/messages/LeadComposer';
import { LeadDetailsForm } from '@/components/leads/LeadDetailsForm';
import { LeadNotesPanel } from '@/components/leads/LeadNotesPanel';
import { StageBadge } from './StageBadge';

interface PipelineDetail {
  lead: Lead;
  events: PipelineEvent[];
}

interface PipelineDetailSheetProps {
  /** Lead-ul deschis; `null` închide fișa. */
  leadId: string | null;
  onClose: () => void;
  /** Apelat după orice schimbare (etapă, detalii, ștergere), ca lista să se resincronizeze. */
  onUpdated: () => void;
}


/** Linkurile importate pot veni fără schemă („instagram.com/x" sau doar „x"). */
function externalUrl(value: string, base?: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (base && !value.includes('.')) return `${base}${value.replace(/^@/, '')}`;
  return `https://${value}`;
}

export function PipelineDetailSheet({ leadId, onClose, onUpdated }: PipelineDetailSheetProps) {
  const [detail, setDetail] = useState<PipelineDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [amountEur, setAmountEur] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);

  const load = useCallback(async (id: string, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pipeline/manage/${id}`, { signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca lead-ul');
      setDetail(data as PipelineDetail);
      setStage((data as PipelineDetail).lead.pipeline_stage ?? '');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      toast.error(err instanceof Error ? err.message : 'Nu am putut încărca lead-ul');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setEditing(false);
    if (!leadId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    load(leadId, controller.signal);
    return () => controller.abort();
  }, [leadId, load]);

  async function handleSaveStage() {
    if (!detail || !stage || stage === detail.lead.pipeline_stage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pipeline/manage/${detail.lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut schimba etapa');
      setDetail(data as PipelineDetail);
      toast.success(`Etapă schimbată: ${STAGE_LABELS[stage] ?? stage}`);
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut schimba etapa');
      setStage(detail.lead.pipeline_stage ?? '');
    } finally {
      setSaving(false);
    }
  }

  /** Lead-ul actualizat de un endpoint din /api/leads: fișa și lista se resincronizează. */
  function applyLead(updated: Lead) {
    setDetail((prev) => (prev ? { ...prev, lead: updated } : prev));
    onUpdated();
  }

  async function handleDelete() {
    if (!detail) return;
    const name = detail.lead.company_name;
    // Ștergerea e definitivă și nu are „undo", deci cerem o confirmare explicită
    if (!window.confirm(`Ștergi definitiv lead-ul „${name}"?\n\nDispar și istoricul, notele și pașii lui de outreach. Acțiunea nu poate fi anulată.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${detail.lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Eroare la ștergere');
      toast.success(`Lead-ul „${name}" a fost șters.`);
      onClose();
      onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la ștergere');
    } finally {
      setDeleting(false);
    }
  }

  async function handleGeneratePitch() {
    if (!detail) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/leads/${detail.lead.id}/pitch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la generarea pitch-ului');
      applyLead(data.lead as Lead);
      toast.success('Pitch generat — revizuiește-l înainte de trimitere.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la generarea pitch-ului');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreatePaymentLink() {
    if (!detail) return;
    const amount = Number(amountEur);
    if (!amount || amount <= 0) {
      toast.error('Introdu o sumă validă în EUR.');
      return;
    }
    setCreatingLink(true);
    try {
      const res = await fetch(`/api/leads/${detail.lead.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountEur: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la generarea link-ului');
      applyLead(data.lead as Lead);
      toast.success('Link de plată generat.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la generarea link-ului');
    } finally {
      setCreatingLink(false);
    }
  }

  const lead = detail?.lead;
  // Lead-urile din pipeline au în score_details forma PipelineScoreDetails
  const details = (lead?.score_details ?? null) as unknown as Partial<PipelineScoreDetails> | null;
  const issues = details?.audit?.issues ?? [];
  const instagram = lead?.contact_instagram ?? details?.social?.instagram ?? null;
  const facebook = details?.social?.facebook ?? null;

  return (
    <Sheet open={Boolean(leadId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl bg-stone-900 border-stone-800/60 text-stone-100 overflow-y-auto gap-0"
      >
        <SheetHeader className="border-b border-stone-800/60 pr-12">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-stone-100 truncate">{lead?.company_name ?? 'Lead'}</SheetTitle>
              <SheetDescription className="text-stone-500">
                {lead ? [lead.niche, lead.location, lead.source_ref].filter(Boolean).join(' · ') : 'Se încarcă...'}
              </SheetDescription>
            </div>
            {lead && (
              <Button
                size="sm"
                variant="outline"
                title="Șterge lead-ul"
                disabled={deleting}
                onClick={handleDelete}
                className="shrink-0 text-red-400 hover:text-red-300 hover:border-red-500/40"
              >
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Șterge
              </Button>
            )}
          </div>
        </SheetHeader>

        {loading && !lead ? (
          <div className="flex items-center justify-center py-16 text-stone-500">
            <Loader2 className="animate-spin mr-2" size={16} />
            <span className="text-sm">Se încarcă...</span>
          </div>
        ) : lead ? (
          <div className="p-4 space-y-6">
            {/* Etapă */}
            <section className="space-y-2">
              <SectionTitle>Etapă</SectionTitle>
              <div className="flex items-center gap-2">
                <StageBadge stage={lead.pipeline_stage} />
                <span className="text-xs text-stone-600">status CRM: {lead.status}</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="flex-1 bg-stone-950/60 border border-stone-800/60 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/40"
                >
                  {!lead.pipeline_stage && <option value="">—</option>}
                  {PIPELINE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s] ?? s}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleSaveStage}
                  disabled={saving || !stage || stage === lead.pipeline_stage}
                  className="bg-amber-500 text-black hover:bg-amber-400"
                >
                  {saving ? <Loader2 className="animate-spin" /> : 'Salvează'}
                </Button>
              </div>
              <p className="text-[11px] text-stone-600">
                Etapa nu coboară. Câștigat, Pierdut și Nu contacta se pot seta oricând, iar o etapă finală se poate corecta în oricare alta.
              </p>
            </section>

            {/* Detalii editabile: nume, site, contact, note */}
            <section className="space-y-2">
              <div className="flex items-center">
                <SectionTitle>Detalii firmă și contact</SectionTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing((v) => !v)}
                  className="ml-auto h-7 text-xs text-stone-400 hover:text-stone-200"
                >
                  {editing ? <X /> : <Pencil />}
                  {editing ? 'Închide' : 'Editează'}
                </Button>
              </div>
              {editing && (
                <LeadDetailsForm
                  key={lead.id}
                  lead={lead}
                  onUpdated={(updated) => {
                    setDetail((prev) => (prev ? { ...prev, lead: updated } : prev));
                    onUpdated();
                  }}
                />
              )}
            </section>

            {/* Semnale */}
            <section className="space-y-2">
              <SectionTitle>Semnale</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                <Signal label="Pixel Meta" on={details?.signals?.metaPixel} />
                <Signal label="Google Ads" on={details?.signals?.googleAds} />
                <Signal label="Activ pe social" on={details?.signals?.activeOnSocial} />
                <Signal label="ICP match" on={lead.icp_match ?? details?.icpMatch} />
                {details?.signals?.hasActiveMetaAds !== undefined && (
                  <Signal label="Reclame Meta active" on={details.signals.hasActiveMetaAds} />
                )}
                {details?.signals?.siteLoaded !== undefined && (
                  <>
                    <Signal label="Site încărcat" on={details.signals.siteLoaded} />
                    {details.signals.siteLoaded && (
                      <>
                        <Signal label="Analytics" on={details.signals.gtag} />
                        <Signal label="Programări online" on={details.signals.booking} />
                        <Signal label="Chat" on={details.signals.chat} />
                        <Signal label="Mobil (viewport)" on={details.signals.viewport} />
                        <Signal label="HTTPS" on={details.signals.https} />
                      </>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-stone-500">
                Segment <span className="text-stone-200 font-semibold">{lead.segment ?? '—'}</span>
                {' · '}Scor <span className="text-stone-200 font-semibold">{lead.score ?? '—'}</span>
              </p>
              {details?.reason && <p className="text-xs text-stone-400 leading-relaxed">{details.reason}</p>}
            </section>

            {/* Audit */}
            {issues.length > 0 && (
              <section className="space-y-2">
                <SectionTitle>Probleme din audit</SectionTitle>
                <ul className="list-disc pl-5 space-y-1 text-sm text-stone-300">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Linkuri + contact */}
            <section className="space-y-2">
              <SectionTitle>Contact și linkuri</SectionTitle>
              <div className="space-y-1.5 text-sm">
                {lead.website && <LinkRow label="Website" href={externalUrl(lead.website)} text={lead.website} />}
                {instagram && (
                  <LinkRow label="Instagram" href={externalUrl(instagram, 'https://instagram.com/')} text={instagram} />
                )}
                {facebook && (
                  <LinkRow label="Facebook" href={externalUrl(facebook, 'https://facebook.com/')} text={facebook} />
                )}
                {lead.contact_email && <InfoRow label="Email" text={lead.contact_email} />}
                {lead.contact_phone && <InfoRow label="Telefon" text={lead.contact_phone} />}
                {lead.address && <InfoRow label="Adresă" text={lead.address} />}
                {lead.rating !== null && (
                  <InfoRow
                    label="Rating"
                    text={`★ ${Number(lead.rating).toFixed(1)}${lead.reviews_count !== null ? ` (${lead.reviews_count} recenzii)` : ''}`}
                  />
                )}
              </div>
            </section>

            {/* Trimite un mesaj: canal, template / mesaj AI, editare, ajustare AI */}
            <section className="space-y-3">
              <SectionTitle>Trimite un mesaj</SectionTitle>
              {!lead.pitch_generated && (
                <div className="flex items-center gap-3 rounded-lg border border-stone-800/60 bg-stone-950/40 px-3 py-2">
                  <p className="flex-1 text-xs text-stone-500">Lead-ul nu are încă un pitch AI.</p>
                  <Button size="sm" variant="outline" disabled={generating} onClick={handleGeneratePitch}>
                    {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Generează pitch
                  </Button>
                </div>
              )}
              <LeadComposer
                lead={lead}
                onChanged={() => {
                  load(lead.id);
                  onUpdated();
                }}
              />
            </section>

            {/* Link de plată: după consultanță, când prețul e confirmat (status „negotiating”) */}
            <section className="space-y-2">
              <SectionTitle>Link de plată</SectionTitle>
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
                    aria-label="Copiază linkul"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      placeholder="Sumă (EUR)"
                      value={amountEur}
                      onChange={(e) => setAmountEur(e.target.value)}
                      disabled={lead.status !== 'negotiating'}
                    />
                    <Button
                      variant="outline"
                      disabled={creatingLink || lead.status !== 'negotiating'}
                      onClick={handleCreatePaymentLink}
                    >
                      {creatingLink ? <Loader2 className="animate-spin" /> : <LinkIcon />}
                      Generează link
                    </Button>
                  </div>
                  <p className="text-[11px] text-stone-600">
                    Disponibil din etapele Call programat, Call făcut și Ofertă (status „negotiating”), după ce prețul a fost confirmat.
                  </p>
                </>
              )}
            </section>

            {/* Istoric: conversația pe toate canalele, evenimentele și notele (ca în /leads) */}
            <section className="space-y-2">
              <SectionTitle>Istoric</SectionTitle>
              {/* Cheia reîncarcă istoricul după orice schimbare a lead-ului (etapă, detalii) */}
              <LeadNotesPanel key={`${lead.id}:${lead.updated_at}`} leadId={lead.id} />
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">{children}</h3>;
}

function Signal({ label, on }: { label: string; on: boolean | null | undefined }) {
  const Icon = on ? Check : X;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${
        on
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-stone-900/60 text-stone-500 border-stone-800/60'
      }`}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}

function LinkRow({ label, href, text }: { label: string; href: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-stone-500">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 min-w-0 text-amber-400 hover:underline"
      >
        <span className="truncate">{text.replace(/^https?:\/\//, '')}</span>
        <ExternalLink size={12} className="shrink-0" />
      </a>
    </div>
  );
}

function InfoRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-stone-500">{label}</span>
      <span className="text-stone-300 break-all">{text}</span>
    </div>
  );
}
