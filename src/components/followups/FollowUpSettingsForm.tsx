'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bot, Loader2, PhoneMissed, Plug, RefreshCw, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Toggle } from './Toggle';
import { CopyField } from './CopyField';
import type { FollowUpSettingsResponse } from '@/services/followups/response';
import type { OrganizationSettingsPatch } from '@/services/followups/types';

interface Props {
  initial: FollowUpSettingsResponse;
}

// Auto-reply-ul pe Facebook / Instagram se setează din /socials, nu de aici
type FormState = Required<Omit<OrganizationSettingsPatch, 'social_ai_enabled'>>;

function toFormState(data: FollowUpSettingsResponse): FormState {
  return {
    missed_call_sms_enabled: data.settings.missed_call_sms_enabled,
    missed_call_sms_message: data.settings.missed_call_sms_message,
    whatsapp_ai_enabled: data.settings.whatsapp_ai_enabled,
    whatsapp_system_prompt: data.settings.whatsapp_system_prompt,
    human_takeover_minutes: data.settings.human_takeover_minutes,
  };
}

const SECTION = 'rounded-2xl border border-stone-800/60 bg-stone-900/50 p-5 space-y-4';
const TEXTAREA =
  'w-full rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2 text-sm text-stone-200 placeholder:text-stone-600 outline-none transition-colors focus:border-amber-500/60 disabled:opacity-50';

export function FollowUpSettingsForm({ initial }: Props) {
  const [data, setData] = useState<FollowUpSettingsResponse>(initial);
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);

  const saved = useMemo(() => toFormState(data), [data]);
  const isDirty = useMemo(
    () => (Object.keys(form) as (keyof FormState)[]).some((key) => form[key] !== saved[key]),
    [form, saved]
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (saving || !isDirty) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/followup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Eroare la salvare');

      setData(payload as FollowUpSettingsResponse);
      setForm(toFormState(payload as FollowUpSettingsResponse));
      toast.success('Setări salvate.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  async function handleRotateKey() {
    if (rotating) return;
    const ok = window.confirm(
      'Regenerezi API Key-ul? Cheia curentă devine imediat invalidă și trebuie actualizată în site.'
    );
    if (!ok) return;

    setRotating(true);
    try {
      const res = await fetch('/api/settings/followup/rotate-key', { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Eroare la regenerare');

      setData(payload as FollowUpSettingsResponse);
      toast.success('API Key regenerat — actualizează-l în site.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la regenerare');
    } finally {
      setRotating(false);
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Antet */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title text-stone-100">AI Follow-Up & WhatsApp</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Răspunsuri automate la apeluri pierdute și pe WhatsApp, plus lead-uri primite direct din
            formularele site-ului. Setările se aplică organizației curente.
          </p>
        </div>
        <IntegrationBadges integrations={data.integrations} />
      </div>

      {/* SMS apel pierdut */}
      <section className={SECTION}>
        <SectionHeader
          icon={<PhoneMissed className="h-4 w-4 text-amber-400" />}
          title="SMS la apel pierdut"
          subtitle="Când un apel rămâne fără răspuns, clientul primește automat un SMS și se creează un lead."
        />

        <Toggle
          checked={form.missed_call_sms_enabled}
          onChange={(v) => set('missed_call_sms_enabled', v)}
          label="Activează SMS-ul automat"
          description="Se aplică și lead-urilor venite din formularele site-ului (SMS de confirmare)."
        />

        <div>
          <Label className="mb-1.5 block text-xs text-stone-500">Mesaj SMS implicit</Label>
          <textarea
            rows={3}
            className={TEXTAREA}
            value={form.missed_call_sms_message}
            onChange={(e) => set('missed_call_sms_message', e.target.value)}
            placeholder="Salut! Am văzut că ai sunat. Cu ce te ajutăm?"
            disabled={!form.missed_call_sms_enabled}
          />
          <p className="mt-1.5 text-xs text-stone-600">
            Lasă gol pentru ca mesajul să fie generat de AI (Groq / Llama 3.3 70B) la fiecare apel.
            {form.missed_call_sms_message.length > 0 && (
              <span className="ml-1 text-stone-500">
                {form.missed_call_sms_message.length} caractere
                {form.missed_call_sms_message.length > 160 && ' — peste 160, Twilio îl taxează ca mesaj multiplu.'}
              </span>
            )}
          </p>
        </div>
      </section>

      {/* AI WhatsApp */}
      <section className={SECTION}>
        <SectionHeader
          icon={<Bot className="h-4 w-4 text-amber-400" />}
          title="Auto-Reply AI pe WhatsApp"
          subtitle="AI-ul răspunde doar dacă niciun operator uman nu a preluat conversația în intervalul setat."
        />

        <Toggle
          checked={form.whatsapp_ai_enabled}
          onChange={(v) => set('whatsapp_ai_enabled', v)}
          label="Activează răspunsurile automate"
          description="Mesajele primite se salvează în CRM chiar și cu opțiunea dezactivată."
        />

        <div className="max-w-xs">
          <Label className="mb-1.5 block text-xs text-stone-500">
            Timp de așteptare agent uman (minute)
          </Label>
          <Input
            type="number"
            min={0}
            max={1440}
            value={form.human_takeover_minutes}
            onChange={(e) => set('human_takeover_minutes', Number(e.target.value))}
            disabled={!form.whatsapp_ai_enabled}
          />
          <p className="mt-1.5 text-xs text-stone-600">
            După ce un operator preia conversația, AI-ul tace atâtea minute. 0 = AI-ul nu mai preia
            deloc conversațiile marcate manual.
          </p>
        </div>

        <div>
          <Label className="mb-1.5 block text-xs text-stone-500">System Prompt</Label>
          <textarea
            rows={9}
            className={`${TEXTAREA} font-mono leading-relaxed`}
            value={form.whatsapp_system_prompt}
            onChange={(e) => set('whatsapp_system_prompt', e.target.value)}
            placeholder="Ești asistentul virtual al agenției..."
            disabled={!form.whatsapp_ai_enabled}
          />
          <p className="mt-1.5 text-xs text-stone-600">
            Personalitatea, tonul și limitele AI-ului. Ultimele 20 de mesaje ale conversației se
            trimit ca istoric la fiecare răspuns.
          </p>
        </div>
      </section>

      {/* Integrare */}
      <section className={SECTION}>
        <SectionHeader
          icon={<Plug className="h-4 w-4 text-amber-400" />}
          title="Integrare"
          subtitle="Datele de conectare pentru Twilio și pentru formularele site-ului."
        />

        <CopyField
          label="Webhook URL (Twilio)"
          value={data.webhookUrl}
          hint={
            'Twilio Console → numărul tău → „A call comes in” / „When a message comes in” (metoda POST). ' +
            'Același URL tratează și apelurile, și mesajele.'
          }
        />

        <CopyField
          label="API Key (site)"
          value={data.settings.api_key}
          secret
          hint={`Se trimite în body-ul POST către ${data.leadsEndpoint} — DOAR din server (nu-l expune în cod de browser).`}
        />

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="outline" size="sm" onClick={handleRotateKey} disabled={rotating}>
            {rotating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Regenerează API Key
          </Button>
          <span className="text-xs text-stone-600">Organizație: {data.settings.org_id}</span>
        </div>

        <details className="rounded-lg border border-stone-800/60 bg-stone-950/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-stone-400 select-none">
            Exemplu de request din site
          </summary>
          <pre className="mt-3 overflow-x-auto text-[11px] leading-relaxed text-stone-400">
{`await fetch('${data.leadsEndpoint}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Ion Popescu',
    phone: '+40712345678',
    serviceDesired: 'Website de prezentare',
    apiKey: process.env.CRM_API_KEY,
  }),
});`}
          </pre>
        </details>
      </section>

      {/* Bară de salvare */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-800/60 bg-stone-900/95 px-6 py-3 backdrop-blur lg:pl-72">
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-stone-500">
            {isDirty ? 'Ai modificări nesalvate' : 'Toate modificările sunt salvate'}
          </span>
          <Button onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? 'Se salvează...' : 'Salvează setările'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-stone-800/60 pb-4">
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-semibold text-stone-100">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{subtitle}</p>
      </div>
    </div>
  );
}

function IntegrationBadges({ integrations }: { integrations: FollowUpSettingsResponse['integrations'] }) {
  const items = [
    { label: 'SMS', ok: integrations.sms, env: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER' },
    { label: 'WhatsApp', ok: integrations.whatsapp, env: 'TWILIO_WHATSAPP_NUMBER' },
    { label: 'AI (Groq)', ok: integrations.groq, env: 'GROQ_API_KEY' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => (
        <span
          key={item.label}
          title={item.ok ? 'Configurat' : `Lipsește din environment: ${item.env}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
            item.ok
              ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
              : 'border-stone-800 bg-stone-900/60 text-stone-500'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${item.ok ? 'bg-emerald-400' : 'bg-stone-600'}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
