'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Cpu, Loader2, Play, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EngineRun, EngineSettings, EngineStats } from '@/services/engine/types';
import { KNOWN_NICHES } from '@/services/leads/osm-categories';
import { RO_CITIES } from '@/services/leads/ro-cities';

interface EngineState {
  settings: EngineSettings;
  stats: EngineStats;
  runs: EngineRun[];
  sources: { osm: boolean; overture: boolean; metaAdLibrary: boolean; googlePlaces: boolean };
  model: string;
}

interface EnginePanelProps {
  /** Apelat după o rulare sau un import, ca lista din /pipeline să se reîncarce. */
  onChanged: () => void;
}

const timeFormatter = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const KIND_LABELS: Record<string, string> = { discover: 'Discover', enrich: 'Enrich', import: 'Import CSV' };

/** Text cu o valoare pe rând (sau separate prin virgulă) → listă. */
const toList = (text: string) => text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);

export function EnginePanel({ onChanged }: EnginePanelProps) {
  const [state, setState] = useState<EngineState | null>(null);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<'discover' | 'enrich' | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const [niches, setNiches] = useState('');
  const [cities, setCities] = useState('');
  const [maxNew, setMaxNew] = useState('');
  const [batch, setBatch] = useState('8');
  const [minScore, setMinScore] = useState('50');
  // Perechea pentru o rulare discover manuală; ambele goale = rotația din setări
  const [targetNiche, setTargetNiche] = useState('');
  const [targetCity, setTargetCity] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/engine/settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca motorul');
      const next = data as EngineState;
      setState(next);
      setNiches(next.settings.niches.join('\n'));
      setCities(next.settings.cities.join('\n'));
      setMaxNew(next.settings.max_new_per_day === null ? '' : String(next.settings.max_new_per_day));
      setBatch(String(next.settings.enrich_batch));
      setMinScore(String(next.settings.min_score));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut încărca motorul');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(kind: 'discover' | 'enrich') {
    const niche = targetNiche.trim();
    const city = targetCity.trim();
    if (kind === 'discover' && Boolean(niche) !== Boolean(city)) {
      toast.error('Completează și nișa, și orașul — sau lasă-le goale pentru rotația din setări');
      return;
    }

    setRunning(kind);
    try {
      const res = await fetch('/api/engine/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'discover' && niche ? { kind, niche, city } : { kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Rularea a eșuat');

      if (kind === 'discover') {
        toast.success(
          data.skipped
            ? `Discover sărit: ${data.skipped}`
            : `${data.niche} × ${data.city}: ${data.found} găsiți, ${data.inserted} noi, ${data.duplicates} duplicate`
        );
      } else {
        toast.success(`Enrich: ${data.processed} lead-uri procesate`);
      }
      if (data.errors?.length) toast.warning(data.errors.slice(0, 3).join(' · '));
      onChanged();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Rularea a eșuat');
    } finally {
      setRunning(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/engine/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          niches: toList(niches),
          cities: toList(cities),
          max_new_per_day: maxNew.trim() === '' ? null : Number(maxNew),
          enrich_batch: Number(batch),
          min_score: Number(minScore),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva setările');
      toast.success('Setările motorului au fost salvate');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva setările');
    } finally {
      setSaving(false);
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/engine/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Importul a eșuat');
      toast.success(`Import: ${data.inserted} noi, ${data.duplicates} duplicate, ${data.skipped} rânduri sărite`);
      onChanged();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Importul a eșuat');
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  const stats = state?.stats;

  return (
    <section className="rounded-xl border border-stone-800/60 bg-stone-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Cpu size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-stone-100">Motor leaduri</h2>
        {stats && (
          <div className="flex flex-wrap gap-3 text-xs text-stone-500">
            <span>
              Noi azi <span className="text-stone-200 font-semibold">{stats.newToday}</span>/{stats.maxNewPerDay}
            </span>
            <span>
              În coadă <span className="text-stone-200 font-semibold">{stats.queued}</span>
            </span>
            <span>
              Erori AI <span className={stats.aiErrors > 0 ? 'text-red-400 font-semibold' : 'text-stone-200 font-semibold'}>{stats.aiErrors}</span>
            </span>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={targetNiche}
            onChange={(e) => setTargetNiche(e.target.value)}
            list="engine-niches"
            placeholder="Nișă (gol = rotație)"
            aria-label="Nișă pentru discover"
            maxLength={80}
            className={`${inputClass} !w-44 !py-1.5 text-xs`}
          />
          <input
            value={targetCity}
            onChange={(e) => setTargetCity(e.target.value)}
            list="engine-cities"
            placeholder="Oraș"
            aria-label="Oraș pentru discover"
            maxLength={80}
            className={`${inputClass} !w-36 !py-1.5 text-xs`}
          />
          <datalist id="engine-niches">
            {[...new Set([...(state?.settings.niches ?? []), ...KNOWN_NICHES])].map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <datalist id="engine-cities">
            {[...new Set([...(state?.settings.cities ?? []), ...RO_CITIES])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Button size="sm" variant="outline" disabled={running !== null} onClick={() => run('discover')}>
            {running === 'discover' ? <Loader2 className="animate-spin" /> : <Play />}
            Rulează discover
          </Button>
          <Button size="sm" variant="outline" disabled={running !== null} onClick={() => run('enrich')}>
            {running === 'enrich' ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Rulează enrich
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="text-stone-400 hover:text-stone-100 hover:bg-stone-800">
            Setări
            <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {open && state && (
        <div className="border-t border-stone-800/60 p-4 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Nișe pentru rotația automată (una pe rând)"
              hint="Orice nișă: din listă, un tag OSM (ex. amenity=veterinary) sau text liber, căutat în numele firmelor"
            >
              <textarea value={niches} onChange={(e) => setNiches(e.target.value)} rows={6} className={inputClass} />
            </Field>
            <Field label="Orașe pentru rotația automată (unul pe rând)" hint="Orice localitate din România">
              <textarea value={cities} onChange={(e) => setCities(e.target.value)} rows={6} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Lead-uri noi / zi" hint="Gol = valoarea din env (implicit 150)">
              <input value={maxNew} onChange={(e) => setMaxNew(e.target.value)} inputMode="numeric" className={inputClass} />
            </Field>
            <Field label="Lead-uri / rulare enrich">
              <input value={batch} onChange={(e) => setBatch(e.target.value)} inputMode="numeric" className={inputClass} />
            </Field>
            <Field label="Scor minim ICP">
              <input value={minScore} onChange={(e) => setMinScore(e.target.value)} inputMode="numeric" className={inputClass} />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving} className="bg-amber-500 text-black hover:bg-amber-400">
              {saving && <Loader2 className="animate-spin" />}
              Salvează setările
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
            />
            <Button size="sm" variant="outline" disabled={importing} onClick={() => fileInput.current?.click()}>
              {importing ? <Loader2 className="animate-spin" /> : <Upload />}
              Import CSV (LinkedIn etc.)
            </Button>
            <span className="text-[11px] text-stone-600">
              Surse: {state.sources.overture ? 'Overture · ' : ''}OSM{state.sources.metaAdLibrary ? ' · Meta Ad Library' : ''}
              {state.sources.googlePlaces ? ' · Google Places' : ''} · model {state.model}
            </span>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Ultimele rulări</h3>
            {state.runs.length === 0 ? (
              <p className="text-xs text-stone-600">Nicio rulare încă.</p>
            ) : (
              <ul className="divide-y divide-stone-800/60 rounded-lg border border-stone-800/60">
                {state.runs.map((run) => (
                  <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                    <span className="font-medium text-stone-200 w-20">{KIND_LABELS[run.kind] ?? run.kind}</span>
                    <span className="text-stone-500 w-28">{timeFormatter.format(new Date(run.started_at))}</span>
                    <span className="text-stone-400">
                      {run.kind === 'enrich'
                        ? `${run.processed}/${run.found} procesate`
                        : `${run.found} găsiți · ${run.inserted} noi`}
                      {run.params && 'niche' in run.params ? ` · ${String(run.params.niche)} × ${String(run.params.city)}` : ''}
                    </span>
                    {!run.finished_at && <span className="text-amber-400">în curs</span>}
                    {run.errors.length > 0 && (
                      <span className="text-red-400/80 truncate max-w-full" title={run.errors.join('\n')}>
                        {run.errors[0]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

const inputClass =
  'w-full bg-stone-950/60 border border-stone-800/60 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/40';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-stone-600">{hint}</span>}
    </label>
  );
}
