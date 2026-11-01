'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, Eye, Loader2, Mail, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmailPreview } from '@/components/messages/EmailPreview';
import type { OutreachSettings } from '@/services/outreach/types';

interface Template {
  id: number;
  title: string;
  content: string;
  case_type?: string | null;
}

interface OutreachState {
  settings: OutreachSettings;
  stats: { pending: number; dueNow: number; sentToday: number; sentTotal: number; replied: number; failed: number };
  previewLeads: { id: string; name: string; location: string | null; hasPitch: boolean }[];
  status: { enabled: boolean; footer: boolean; emailConfigured: boolean; windowBlock: string | null; cap: number; testMode: boolean };
}

interface Preview {
  lead: string;
  subject: string | null;
  html: string | null;
  text: string | null;
  note: string | null;
}

type Step = 1 | 2 | 3;
type Choices = Record<Step, number | null>;

const STEPS: { step: Step; label: string; sub: string; caseType: string; ai: string }[] = [
  { step: 1, label: 'Pasul 1', sub: 'ziua 1', caseType: 'cold_outreach', ai: 'Pitch AI personalizat (din enrich)' },
  { step: 2, label: 'Pasul 2', sub: 'ziua 4', caseType: 'follow_up', ai: 'Follow-up AI personalizat' },
  { step: 3, label: 'Pasul 3', sub: 'ziua 9', caseType: 'follow_up', ai: 'Ultimul follow-up AI' },
];

/** Aceleași tipuri de caz ca în /educational-templates. */
const CASE_LABELS: Record<string, string> = {
  after_call: 'After call',
  offer_request: 'Offer request',
  follow_up: 'Follow Up',
  cold_outreach: 'Cold outreach',
};

const toChoices = (s: OutreachSettings): Choices => ({ 1: s.step1_template_id, 2: s.step2_template_id, 3: s.step3_template_id });

export function OutreachPanel() {
  const [state, setState] = useState<OutreachState | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Choices>({ 1: null, 2: null, 3: null });
  const [saving, setSaving] = useState(false);
  const [dailyTarget, setDailyTarget] = useState('');

  const [previewStep, setPreviewStep] = useState<Step>(1);
  const [previewLead, setPreviewLead] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [creatingFor, setCreatingFor] = useState<Step | null>(null);

  const load = useCallback(async () => {
    try {
      const [settingsRes, templatesRes] = await Promise.all([fetch('/api/outreach/settings'), fetch('/api/educational-templates')]);
      const data = await settingsRes.json();
      if (!settingsRes.ok) throw new Error(data.error ?? 'Nu am putut încărca outreach-ul');
      const next = data as OutreachState;
      setState(next);
      setChoices(toChoices(next.settings));
      setDailyTarget(String(next.settings.daily_target));
      setError(null);
      if (templatesRes.ok) setTemplates((await templatesRes.json()) as Template[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut încărca outreach-ul');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runPreview = useCallback(
    async (step: Step, current: Choices, leadId: string) => {
      setPreviewing(true);
      try {
        const res = await fetch('/api/outreach/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step, templateId: current[step], step1TemplateId: current[1], leadId: leadId || null }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Preview eșuat');
        setPreview(data as Preview);
      } catch (err) {
        setPreview(null);
        toast.error(err instanceof Error ? err.message : 'Preview eșuat');
      } finally {
        setPreviewing(false);
      }
    },
    []
  );

  // Preview-ul urmărește pasul, alegerea și lead-ul selectate
  useEffect(() => {
    if (open && state) runPreview(previewStep, choices, previewLead);
  }, [open, state, previewStep, choices, previewLead, runPreview]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/outreach/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step1_template_id: choices[1],
          step2_template_id: choices[2],
          step3_template_id: choices[3],
          // Doar dacă s-a schimbat: înainte de migrare coloana lipsește
          daily_target: targetChanged ? Number(dailyTarget) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva');
      toast.success('Setările outreach-ului au fost salvate — modelele se aplică leadurilor planificate de acum');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva');
    } finally {
      setSaving(false);
    }
  }

  const saved = state ? toChoices(state.settings) : null;
  const targetValid = /^\d{1,4}$/.test(dailyTarget) && Number(dailyTarget) <= 1000;
  const targetChanged = targetValid && Number(dailyTarget) !== state?.settings.daily_target;
  const dirty = saved !== null && (STEPS.some(({ step }) => saved[step] !== choices[step]) || targetChanged);
  const status = state?.status;

  return (
    <section className="rounded-xl border border-stone-800/60 bg-stone-900/60">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Mail size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-stone-100">Outreach email</h2>
        {state && (
          <div className="flex flex-wrap gap-3 text-xs text-stone-500">
            <span>
              Trimise azi <span className="text-stone-200 font-semibold">{state.stats.sentToday}</span>/{state.status.cap}
            </span>
            <span>
              Programate <span className="text-stone-200 font-semibold">{state.stats.pending}</span>
            </span>
            <span>
              Răspunsuri <span className="text-stone-200 font-semibold">{state.stats.replied}</span>
            </span>
            {state.stats.failed > 0 && (
              <span>
                Eșuate <span className="text-red-400 font-semibold">{state.stats.failed}</span>
              </span>
            )}
            <StatusChip status={state.status} />
          </div>
        )}
        {error && <span className="text-xs text-red-400/90">{error}</span>}
        <div className="ml-auto">
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} className="text-stone-400 hover:text-stone-100 hover:bg-stone-800">
            Modele și preview
            <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {open && state && (
        <div className="border-t border-stone-800/60 p-4 space-y-5">
          {status && !status.footer && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Lipsește OUTREACH_SENDER_FOOTER (semnătura PFA) — fără ea nu pleacă niciun email.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            {STEPS.map(({ step, label, sub, caseType, ai }) => (
              <StepPicker
                key={step}
                label={label}
                sub={sub}
                aiLabel={ai}
                recommendedCase={caseType}
                templates={templates}
                value={choices[step]}
                onChange={(id) => {
                  setChoices((c) => ({ ...c, [step]: id }));
                  setPreviewStep(step);
                }}
                onCreate={() => setCreatingFor(step)}
                onPreview={() => setPreviewStep(step)}
                active={previewStep === step}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-stone-400">
              Țintă outreach / zi
              <input
                value={dailyTarget}
                onChange={(e) => setDailyTarget(e.target.value)}
                inputMode="numeric"
                aria-invalid={!targetValid}
                title="Toate canalele; ținta lunii din Overview = ținta zilnică × zilele lunii"
                className={`${inputClass} !w-20 !py-1.5 ${targetValid ? '' : '!border-red-500/60'}`}
              />
            </label>
            <Button size="sm" onClick={save} disabled={saving || !dirty} className="bg-amber-500 text-black hover:bg-amber-400">
              {saving && <Loader2 className="animate-spin" />}
              Salvează
            </Button>
            <span className="text-[11px] text-stone-600">
              Placeholder-e în template: {'{{name}}'} (firma), {'{{oras}}'}, {'{{nisa}}'}. Follow-up-urile răspund în firul pasului 1 („Re: …”).
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium mr-2">Preview</h3>
              {STEPS.map(({ step, label }) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setPreviewStep(step)}
                  className={`rounded-md px-2.5 py-1 text-xs ${previewStep === step ? 'bg-amber-500/15 text-amber-300' : 'text-stone-400 hover:text-stone-200'}`}
                >
                  {label}
                </button>
              ))}
              <select
                value={previewLead}
                onChange={(e) => setPreviewLead(e.target.value)}
                aria-label="Lead pentru preview"
                className={`${inputClass} !w-auto max-w-[16rem] ml-auto`}
              >
                <option value="">{state.previewLeads.length ? 'Cel mai bun lead din coadă' : 'Lead de exemplu'}</option>
                {state.previewLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.location ? ` · ${l.location}` : ''}
                    {l.hasPitch ? '' : ' (fără pitch AI)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-stone-800/60 bg-stone-950/40">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-stone-800/60 px-3 py-2 text-xs">
                {previewing && <Loader2 size={12} className="animate-spin text-stone-500" />}
                <span className="text-stone-500">Către</span>
                <span className="text-stone-200">{preview?.lead ?? '—'}</span>
                <span className="text-stone-500 ml-2">Subiect</span>
                <span className="text-stone-200 font-medium">{preview?.subject ?? '—'}</span>
              </div>
              {preview?.note && <p className="px-3 pt-2 text-xs text-stone-400">{preview.note}</p>}
              {preview?.html ? (
                <div className="p-2">
                  <EmailPreview html={preview.html} />
                </div>
              ) : (
                <div className="h-24" />
              )}
            </div>
          </div>
        </div>
      )}

      {creatingFor !== null && (
        <NewTemplateDialog
          caseType={STEPS[creatingFor - 1].caseType}
          onClose={() => setCreatingFor(null)}
          onCreated={(template) => {
            setTemplates((list) => [...list, template]);
            setChoices((c) => ({ ...c, [creatingFor]: template.id }));
            setPreviewStep(creatingFor);
            setCreatingFor(null);
          }}
        />
      )}
    </section>
  );
}

function StatusChip({ status }: { status: OutreachState['status'] }) {
  if (!status.enabled) return <span className="text-stone-400">Trimitere oprită (OUTREACH_SEND_ENABLED)</span>;
  if (!status.emailConfigured) return <span className="text-red-400">Email neconfigurat</span>;
  return (
    <span className={status.windowBlock ? 'text-stone-400' : 'text-emerald-400'}>
      {status.windowBlock ? `Pauză: ${status.windowBlock}` : 'Trimite acum'}
      {status.testMode ? ' · mod test (doar adresele permise)' : ''}
    </span>
  );
}

function StepPicker(props: {
  label: string;
  sub: string;
  aiLabel: string;
  recommendedCase: string;
  templates: Template[];
  value: number | null;
  onChange: (id: number | null) => void;
  onCreate: () => void;
  onPreview: () => void;
  active: boolean;
}) {
  // Template-urile cu tipul de caz potrivit pasului apar primele
  const recommended = props.templates.filter((t) => t.case_type === props.recommendedCase);
  const others = props.templates.filter((t) => t.case_type !== props.recommendedCase);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${props.active ? 'border-amber-500/40' : 'border-stone-800/60'}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-stone-100">{props.label}</span>
        <span className="text-[11px] text-stone-500">{props.sub}</span>
        <button type="button" onClick={props.onPreview} className="ml-auto text-stone-500 hover:text-stone-200" aria-label={`Preview ${props.label}`}>
          <Eye size={14} />
        </button>
      </div>
      <select
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value ? Number(e.target.value) : null)}
        className={inputClass}
        aria-label={`Model pentru ${props.label}`}
      >
        <option value="">{props.aiLabel}</option>
        {recommended.length > 0 && (
          <optgroup label={CASE_LABELS[props.recommendedCase]}>
            {recommended.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Alte template-uri">
            {others.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.case_type && CASE_LABELS[t.case_type] ? ` (${CASE_LABELS[t.case_type]})` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button type="button" onClick={props.onCreate} className="flex items-center gap-1 text-xs text-amber-400/90 hover:text-amber-300">
        <Plus size={12} /> Template nou
      </button>
    </div>
  );
}

function NewTemplateDialog(props: { caseType: string; onClose: () => void; onCreated: (template: Template) => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [caseType, setCaseType] = useState(props.caseType);
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!title.trim() || !content.trim()) {
      toast.error('Completează subiectul și conținutul');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/educational-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), content, case_type: caseType || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut crea template-ul');
      toast.success('Template creat — apare și în /educational-templates');
      props.onCreated(data as Template);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut crea template-ul');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Template nou">
      <div className="w-full max-w-xl rounded-xl border border-stone-800 bg-stone-900 p-5 space-y-4">
        <div className="flex items-center">
          <h3 className="text-sm font-semibold text-stone-100">Template nou</h3>
          <button type="button" onClick={props.onClose} className="ml-auto text-stone-500 hover:text-stone-200" aria-label="Închide">
            <X size={16} />
          </button>
        </div>
        <label className="block space-y-1.5">
          <span className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Subiect (titlul template-ului)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputClass} placeholder="ex: O întrebare pentru {{name}}" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Tip de caz</span>
          <select value={caseType} onChange={(e) => setCaseType(e.target.value)} className={inputClass}>
            <option value="">Generic</option>
            {Object.entries(CASE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Conținut</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className={inputClass}
            placeholder={'Bună ziua,\n\n… text simplu (paragrafe separate prin rând liber) sau HTML.\nFolosește {{name}}, {{oras}}, {{nisa}}.'}
          />
          <span className="block text-[11px] text-stone-600">
            Semnătura și linkul de dezabonare se adaugă automat. Pentru cold email, textul simplu ajunge mai des în Inbox decât HTML-ul cu design.
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={props.onClose} className="text-stone-400 hover:text-stone-100 hover:bg-stone-800">
            Renunță
          </Button>
          <Button size="sm" onClick={create} disabled={saving} className="bg-amber-500 text-black hover:bg-amber-400">
            {saving && <Loader2 className="animate-spin" />}
            Creează
          </Button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full bg-stone-950/60 border border-stone-800/60 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500/40';
