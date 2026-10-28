'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ExternalLink, Loader2, Check, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { Lead } from '@/services/leads/types';
import type { PipelineEvent, PipelineScoreDetails } from '@/services/pipeline/types';
import { PIPELINE_STAGES, STAGE_LABELS } from '@/services/pipeline/stages';
import { StageBadge } from './StageBadge';

interface PipelineDetail {
  lead: Lead;
  events: PipelineEvent[];
}

interface PipelineDetailSheetProps {
  /** Lead-ul deschis; `null` închide fișa. */
  leadId: string | null;
  onClose: () => void;
  /** Apelat după schimbarea etapei, ca lista să se resincronizeze. */
  onUpdated: () => void;
}

const dateTimeFormatter = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

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

  useEffect(() => {
    if (!leadId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/pipeline/manage/${leadId}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca lead-ul');
        setDetail(data as PipelineDetail);
        setStage((data as PipelineDetail).lead.pipeline_stage ?? '');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        toast.error(err instanceof Error ? err.message : 'Nu am putut încărca lead-ul');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [leadId]);

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
          <SheetTitle className="text-stone-100">{lead?.company_name ?? 'Lead'}</SheetTitle>
          <SheetDescription className="text-stone-500">
            {lead ? [lead.niche, lead.location, lead.source_ref].filter(Boolean).join(' · ') : 'Se încarcă...'}
          </SheetDescription>
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
                Etapa nu coboară. Câștigat, Pierdut și Nu contacta se pot seta oricând.
              </p>
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
              </div>
            </section>

            {/* Mesaje generate */}
            <section className="space-y-3">
              <SectionTitle>Mesaje generate</SectionTitle>
              <CopyBlock label="Subiect email" value={lead.pitch_subject} />
              <CopyBlock label="Email" value={lead.pitch_generated} multiline />
              <CopyBlock label="DM LinkedIn" value={details?.linkedinDm ?? null} multiline />
              <CopyBlock label="DM Instagram" value={details?.instagramDm ?? null} multiline />
            </section>

            {/* Istoric */}
            <section className="space-y-2">
              <SectionTitle>Istoric evenimente</SectionTitle>
              {detail.events.length === 0 ? (
                <p className="text-xs text-stone-600">Niciun eveniment încă.</p>
              ) : (
                <ol className="space-y-2">
                  {detail.events.map((event) => (
                    <li key={event.id} className="rounded-lg border border-stone-800/60 bg-stone-950/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-stone-200">
                          {event.event}
                          {event.channel && <span className="text-stone-500"> · {event.channel}</span>}
                        </span>
                        <span className="text-[11px] text-stone-600 whitespace-nowrap">
                          {dateTimeFormatter.format(new Date(event.occurred_at))}
                        </span>
                      </div>
                      {event.stage && (
                        <div className="mt-1.5">
                          <StageBadge stage={event.stage} />
                        </div>
                      )}
                      {event.reply_text && (
                        <p className="mt-2 text-xs text-stone-400 whitespace-pre-wrap">{event.reply_text}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
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

function CopyBlock({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiat`);
    } catch {
      toast.error('Nu am putut copia în clipboard');
    }
  }

  return (
    <div className="rounded-lg border border-stone-800/60 bg-stone-950/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs font-medium text-stone-400">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={copy}
          disabled={!value}
          className="h-7 px-2 text-stone-400 hover:text-stone-100 hover:bg-stone-800"
        >
          <Copy size={13} />
          Copiază
        </Button>
      </div>
      {value ? (
        <p className={`text-sm text-stone-200 ${multiline ? 'whitespace-pre-wrap leading-relaxed' : ''}`}>{value}</p>
      ) : (
        <p className="text-xs text-stone-600">—</p>
      )}
    </div>
  );
}
