'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Megaphone, Send, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CampaignAudience } from '@/services/outreach/repository';
import { SEND_WINDOWS_LABEL } from '@/services/outreach/schedule';
import type { CampaignFilters, PlanResult } from '@/services/outreach/types';
import { MultiValueInput } from './MultiValueInput';

interface CampaignPanelProps {
  /** Apelat după planificare / trimitere, ca lista paginii să se reîncarce. */
  onChanged: () => void;
}

interface Preview {
  audience: CampaignAudience;
  testMode: boolean;
  step1Template: boolean;
  sendCap: number;
}

/** Leaduri planificate pe cerere (fiecare poate cere un apel AI pentru follow-up-uri). */
const BATCH = 10;

/**
 * „Campanie outreach”: alegi publicul dintre leadurile nepitched (ICP, în
 * coadă, fără secvență) după nișă, oraș și scor, apoi planifici pentru toți
 * secvența de 3 pași (pitch personalizat + 2 follow-up-uri) cu modelele din
 * „Outreach email”. Trimiterea pleacă treptat: jobul outreach-send (sau
 * „Trimite acum”), în intervalele din `schedule.ts`, în plafonul zilnic.
 */
export function CampaignPanel({ onChanged }: CampaignPanelProps) {
  const [open, setOpen] = useState(true);
  const [niches, setNiches] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [minScore, setMinScore] = useState('');
  const [emailOnly, setEmailOnly] = useState(true);
  const [limit, setLimit] = useState('');

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [planning, setPlanning] = useState<{ planned: number; target: number } | null>(null);
  const [sending, setSending] = useState(false);
  const stopRequested = useRef(false);

  const scoreValid = minScore === '' || (/^\d{1,3}$/.test(minScore) && Number(minScore) <= 100);
  const limitValid = limit === '' || (/^\d{1,4}$/.test(limit) && Number(limit) > 0);

  const filters = useCallback(
    (): CampaignFilters => ({ niches, cities, minScore: minScore === '' ? null : Number(minScore), emailOnly }),
    [niches, cities, minScore, emailOnly]
  );

  const loadPreview = useCallback(async () => {
    if (!scoreValid) return;
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: filters(), preview: true }),
      });
      if (res.status === 401 || res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut calcula publicul');
      setPreview(data as Preview);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut calcula publicul');
    } finally {
      setLoading(false);
    }
  }, [filters, scoreValid]);

  // Publicul se recalculează la fiecare schimbare de filtru (cu o mică pauză la tastare)
  useEffect(() => {
    const timer = setTimeout(loadPreview, 400);
    return () => clearTimeout(timer);
  }, [loadPreview]);

  const audience = preview?.audience;
  const matching = audience ? (emailOnly ? audience.withEmail : audience.total) : 0;
  const target = Math.min(matching, limit && limitValid ? Number(limit) : matching);

  async function plan() {
    if (target === 0) return;
    stopRequested.current = false;
    setPlanning({ planned: 0, target });
    let planned = 0;
    let deferred = 0;
    const exclude: string[] = [];
    const errors: string[] = [];
    let stoppedReason: string | undefined;
    try {
      while (planned < target && !stopRequested.current) {
        const res = await fetch('/api/outreach/campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filters: filters(), limit: Math.min(BATCH, target - planned), exclude }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Planificarea a eșuat');
        const batch = data as PlanResult;
        planned += batch.planned;
        deferred += batch.deferred;
        exclude.push(...(batch.deferredIds ?? []));
        errors.push(...batch.errors);
        setPlanning({ planned, target });
        if (batch.stoppedReason) {
          stoppedReason = batch.stoppedReason;
          break;
        }
        // Gata, sau un lot fără progres (erori de inserare): altfel aceiași candidați ar reveni la nesfârșit
        if (batch.candidates === 0 || batch.planned + batch.deferred === 0) break;
      }
      toast.success(`${planned} secvențe planificate${deferred ? `, ${deferred} leaduri sărite` : ''}`);
      if (stoppedReason) toast.warning(`Oprit: ${stoppedReason}`);
      if (errors.length) toast.warning(errors.slice(0, 3).join(' · '));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Planificarea a eșuat');
    } finally {
      setPlanning(null);
      onChanged();
      loadPreview();
    }
  }

  async function sendNow() {
    setSending(true);
    try {
      const res = await fetch('/api/outreach/send-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Trimiterea a eșuat');
      if (data.skipped) toast.warning(`Nu s-a trimis nimic: ${data.skipped}`);
      else toast.success(`${data.sent} emailuri trimise (azi ${data.sentToday + data.sent}/${data.cap})${data.failed ? `, ${data.failed} eșuate` : ''}`);
      if (data.errors?.length) toast.warning(data.errors.slice(0, 3).join(' · '));
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trimiterea a eșuat');
    } finally {
      setSending(false);
    }
  }

  if (forbidden) return null;

  const noPitch = audience && preview && !preview.step1Template ? audience.withEmail - audience.withPitch : 0;

  return (
    <section className="rounded-xl border border-stone-800/60 bg-stone-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Megaphone size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-stone-100">Campanie outreach</h2>
        <span className="text-xs text-stone-500">
          {loading && !audience ? (
            'Se calculează...'
          ) : audience ? (
            <>
              <span className="text-stone-200 font-semibold">{matching}</span> leaduri nepitched potrivite
            </>
          ) : null}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={sending || planning !== null} onClick={sendNow} title={`Trimite acum pașii ajunși la termen (maximum 2; ${SEND_WINDOWS_LABEL})`}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Trimite acum
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="text-stone-400 hover:text-stone-100 hover:bg-stone-800">
            Public
            <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-stone-800/60 p-4 space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <MultiValueInput
              label="Nișe"
              values={niches}
              onChange={setNiches}
              suggestions={audience?.niches.map((n) => n.value) ?? []}
              placeholder="Toate nișele"
              disabled={planning !== null}
            />
            <MultiValueInput
              label="Orașe"
              values={cities}
              onChange={setCities}
              suggestions={audience?.cities.map((c) => c.value) ?? []}
              placeholder="Toate orașele"
              disabled={planning !== null}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400">
            <label className="flex items-center gap-2">
              Scor minim
              <input
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                inputMode="numeric"
                placeholder="—"
                aria-invalid={!scoreValid}
                className={`${inputClass} !w-16 ${scoreValid ? '' : '!border-red-500/60'}`}
              />
            </label>
            <label className="flex items-center gap-2">
              Câte leaduri
              <input
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                inputMode="numeric"
                placeholder="toate"
                aria-invalid={!limitValid}
                className={`${inputClass} !w-20 ${limitValid ? '' : '!border-red-500/60'}`}
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={emailOnly} onChange={(e) => setEmailOnly(e.target.checked)} className="accent-amber-500" />
              Doar cu email
            </label>
            {audience && (
              <span className="text-stone-600">
                {audience.total} în total · {audience.withEmail} cu email · {audience.withPitch} cu pitch AI
              </span>
            )}
          </div>

          {preview?.testMode && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
              Mod test: se planifică și se trimite doar către adresele din OUTREACH_ALLOWED_RECIPIENTS. Scoate variabila ca să ajungă la leadurile reale.
            </p>
          )}
          {noPitch > 0 && (
            <p className="rounded-lg border border-stone-700/60 bg-stone-950/40 px-3 py-2 text-[11px] text-stone-400">
              Pasul 1 e pe pitch AI: {noPitch} leaduri fără pitch vor fi sărite. Rulează „ICP score” sau alege un template la Pasul 1 în „Outreach email”.
            </p>
          )}

          {audience && audience.sample.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {audience.sample.map((lead) => (
                <span
                  key={lead.id}
                  title={[lead.niche, lead.location].filter(Boolean).join(' · ')}
                  className="rounded-md border border-stone-800/60 bg-stone-950/40 px-2 py-0.5 text-[11px] text-stone-400"
                >
                  {lead.name}
                </span>
              ))}
              {matching > audience.sample.length && (
                <span className="px-1 text-[11px] text-stone-600">+{matching - audience.sample.length}</span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {planning ? (
              <>
                <Button size="sm" variant="outline" onClick={() => { stopRequested.current = true; }}>
                  <Square />
                  Oprește
                </Button>
                <span className="flex items-center gap-2 text-xs text-stone-400">
                  <Loader2 size={13} className="animate-spin" />
                  Planificate {planning.planned}/{planning.target}...
                </span>
              </>
            ) : (
              <Button
                size="sm"
                onClick={plan}
                disabled={target === 0 || !scoreValid || !limitValid || loading}
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                <Megaphone />
                Planifică secvențele pentru {target} leaduri
              </Button>
            )}
            <span className="text-[11px] text-stone-600">
              Pitch personalizat + 2 follow-up-uri (ziua 4 și 9), cu modelele din „Outreach email”. Pleacă treptat: {SEND_WINDOWS_LABEL},
              maximum {preview?.sendCap ?? '—'} emailuri/zi; un răspuns oprește secvența.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

const inputClass =
  'bg-stone-950/60 border border-stone-800/60 rounded-lg px-2 py-1 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40';
