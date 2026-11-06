'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Eye, Facebook, Instagram, Linkedin, Loader2, Mail, MessageCircle, RefreshCw, Save, Send, Smartphone, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmailPreview } from './EmailPreview';
import type { Lead } from '@/services/leads/types';
import type { PipelineScoreDetails } from '@/services/pipeline/types';
import {
  CHANNEL_DELIVERY,
  CHANNEL_LABELS,
  CHANNEL_MAX_CHARS,
  DIRECT_CHANNELS,
  channelTarget,
  leadContacts,
  manualChannelUrl,
  type DirectChannel,
} from '@/services/outreach/channels';
import { htmlToText, isHtmlContent, renderTemplate } from '@/services/outreach/render';

interface Template {
  id: number;
  title: string;
  content: string;
  case_type?: string | null;
}

interface ComposerContext {
  configured: { email: boolean; sms: boolean };
  pendingSteps: number;
}

interface LeadComposerProps {
  lead: Lead;
  /** După o trimitere sau o salvare, ca fișa și lista să se reîncarce. */
  onChanged: () => void;
}

const CHANNEL_ICONS: Record<DirectChannel, typeof Mail> = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
};

const CASE_LABELS: Record<string, string> = {
  after_call: 'After call',
  offer_request: 'Offer request',
  follow_up: 'Follow Up',
  cold_outreach: 'Cold outreach',
};

/** Ajustări frecvente, ca să nu scrii instrucțiunea de fiecare dată. */
const QUICK_INSTRUCTIONS = ['Mai scurt', 'Ton mai prietenos', 'Mai formal', 'Pas următor mai ferm', 'Pune accent pe programările online'];

/** Mesajul AI deja generat pentru canal (enrich): pitch-ul pe email, DM-urile pe social. */
function aiDraft(lead: Lead, channel: DirectChannel): { subject: string; body: string } {
  const details = (lead.score_details ?? null) as unknown as Partial<PipelineScoreDetails> | null;
  const pitch = lead.pitch_generated ?? '';
  const shortText = details?.instagramDm || (isHtmlContent(pitch) ? htmlToText(pitch) : pitch);
  switch (channel) {
    case 'email':
      return { subject: lead.pitch_subject ?? '', body: pitch };
    case 'linkedin':
      return { subject: '', body: details?.linkedinDm || shortText };
    default:
      return { subject: '', body: shortText };
  }
}

export function LeadComposer({ lead, onChanged }: LeadComposerProps) {
  const contacts = useMemo(() => leadContacts(lead), [lead]);
  const firstAvailable = DIRECT_CHANNELS.find((c) => channelTarget(c, contacts)) ?? 'email';

  const [channel, setChannel] = useState<DirectChannel>(firstAvailable);
  const [source, setSource] = useState<string>('ai');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [context, setContext] = useState<ComposerContext | null>(null);
  const [instruction, setInstruction] = useState('');
  const [rewriting, setRewriting] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [opened, setOpened] = useState(false);
  const [preview, setPreview] = useState(false);
  const [savingPitch, setSavingPitch] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadContext = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${lead.id}/outreach`);
      if (res.ok) setContext((await res.json()) as ComposerContext);
    } catch {
      // Contextul doar avertizează; compozitorul merge și fără el
    }
  }, [lead.id]);

  useEffect(() => {
    loadContext();
    fetch('/api/educational-templates')
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Template[]) => setTemplates(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, [loadContext]);

  // Canalul sau sursa schimbate încarcă textul corespunzător (editările nesalvate se pierd)
  useEffect(() => {
    setConfirming(false);
    setOpened(false);
    if (source === 'ai') {
      const draft = aiDraft(lead, channel);
      setSubject(draft.subject);
      setBody(draft.body);
      return;
    }
    const template = templates.find((t) => String(t.id) === source);
    if (!template) return;
    const rendered = renderTemplate(template.content, lead);
    setSubject(renderTemplate(template.title, lead, false));
    // DM-urile sunt text: template-urile HTML se transformă
    setBody(channel !== 'email' && isHtmlContent(rendered) ? htmlToText(rendered) : rendered);
  }, [channel, source, lead, templates]);

  const target = channelTarget(channel, contacts);
  const delivery = CHANNEL_DELIVERY[channel];
  const html = isHtmlContent(body);
  const tooLong = body.length > CHANNEL_MAX_CHARS[channel];
  const blockedAuto =
    delivery === 'auto' && context !== null && !(channel === 'email' ? context.configured.email : context.configured.sms);
  const template = templates.find((t) => String(t.id) === source);

  async function rewrite(text: string) {
    if (!body.trim()) return;
    setRewriting(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, subject: channel === 'email' ? subject : null, body, instruction: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ajustarea a eșuat');
      setBody(data.body);
      if (channel === 'email' && data.subject) setSubject(data.subject);
      setConfirming(false);
      toast.success(data.convertedFromHtml ? 'Mesaj ajustat (template-ul HTML a devenit text simplu)' : 'Mesaj ajustat — verifică-l înainte de trimitere');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ajustarea a eșuat');
    } finally {
      setRewriting(false);
    }
  }

  async function record() {
    setSending(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          subject: channel === 'email' ? subject : null,
          body,
          templateId: template ? String(template.id) : null,
          templateTitle: template ? template.title : source === 'ai' ? 'Pitch AI' : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Trimiterea a eșuat');
      toast.success(
        delivery === 'auto'
          ? `${CHANNEL_LABELS[channel]} trimis către ${target}${data.cancelledSteps ? ` · ${data.cancelledSteps} pași automați anulați` : ''}`
          : `Trimiterea pe ${CHANNEL_LABELS[channel]} a fost înregistrată`
      );
      setConfirming(false);
      setOpened(false);
      loadContext();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trimiterea a eșuat');
    } finally {
      setSending(false);
    }
  }

  /** Canal manual: textul în clipboard + conversația deschisă; trimiterea o confirmi după. */
  async function openManual() {
    const url = manualChannelUrl(channel, contacts, body);
    try {
      await navigator.clipboard.writeText(body);
      toast.success('Mesaj copiat — lipește-l în conversație');
    } catch {
      toast.error('Nu am putut copia în clipboard');
    }
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setOpened(true);
  }

  /** Rulează acum sincronizarea Gmail + clasificarea (altfel o face jobul programat). */
  async function syncReplies() {
    setSyncing(true);
    try {
      const res = await fetch('/api/outreach/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Verificarea a eșuat');
      toast.success(data.processed > 0 ? `${data.processed} răspunsuri procesate — etapa s-a actualizat` : 'Niciun răspuns nou');
      if (data.processed > 0) onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verificarea a eșuat');
    } finally {
      setSyncing(false);
    }
  }

  async function savePitch() {
    setSavingPitch(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pitch_subject: subject, pitch_generated: body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva');
      toast.success('Salvat ca pitch-ul lead-ului (folosit și de secvența automată)');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva');
    } finally {
      setSavingPitch(false);
    }
  }

  const recommended = templates.filter((t) => t.case_type === 'cold_outreach' || t.case_type === 'follow_up');
  const others = templates.filter((t) => !recommended.includes(t));

  return (
    <div className="space-y-3">
      {/* Canal */}
      <div className="flex flex-wrap gap-1.5">
        {DIRECT_CHANNELS.map((c) => {
          const Icon = CHANNEL_ICONS[c];
          const available = Boolean(channelTarget(c, contacts));
          return (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              title={available ? channelTarget(c, contacts) ?? undefined : `Lead-ul nu are ${CHANNEL_LABELS[c]}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                channel === c
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : available
                    ? 'border-stone-800/60 text-stone-300 hover:border-stone-700'
                    : 'border-stone-800/40 text-stone-600'
              }`}
            >
              <Icon size={12} />
              {CHANNEL_LABELS[c]}
            </button>
          );
        })}
      </div>

      {/* Sursa textului */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Sursa mesajului"
          className={`${inputClass} flex-1 min-w-[12rem]`}
        >
          <option value="ai">Mesaj AI generat pentru {CHANNEL_LABELS[channel]}</option>
          {recommended.length > 0 && (
            <optgroup label="Template-uri outreach">
              {recommended.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.title}
                  {t.case_type ? ` (${CASE_LABELS[t.case_type] ?? t.case_type})` : ''}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Alte template-uri">
              {others.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {channel === 'email' && html && (
          <Button size="sm" variant="ghost" onClick={() => setPreview((v) => !v)} className="text-stone-400 hover:text-stone-100 hover:bg-stone-800">
            <Eye /> {preview ? 'Editează' : 'Preview'}
          </Button>
        )}
      </div>

      {/* Mesaj */}
      {channel === 'email' && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subiect" maxLength={300} className={inputClass} aria-label="Subiect" />
      )}
      {preview && channel === 'email' && html ? (
        <EmailPreview html={body} maxHeight={640} />
      ) : (
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setConfirming(false);
          }}
          rows={channel === 'email' ? 9 : 6}
          placeholder={`Niciun mesaj pentru ${CHANNEL_LABELS[channel]} — alege un template sau scrie-l aici`}
          className={`${inputClass} leading-relaxed ${html ? 'font-mono text-xs' : ''}`}
          aria-label="Mesaj"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-600">
        <span className={tooLong ? 'text-red-400' : undefined}>
          {body.length}/{CHANNEL_MAX_CHARS[channel]} caractere
        </span>
        {channel !== 'email' && html && <span>Se trimite ca text simplu</span>}
      </div>

      {/* Ajustează cu AI */}
      <div className="rounded-lg border border-stone-800/60 bg-stone-950/40 p-2.5 space-y-2">
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && instruction.trim().length >= 3 && !rewriting) rewrite(instruction.trim());
            }}
            placeholder="Cere AI-ului o ajustare: ex. „mai scurt, menționează că lucrăm doar cu clinici din Oradea”"
            maxLength={500}
            className={`${inputClass} flex-1`}
            aria-label="Instrucțiune pentru AI"
          />
          <Button
            size="sm"
            onClick={() => rewrite(instruction.trim())}
            disabled={rewriting || instruction.trim().length < 3 || !body.trim()}
            className="bg-stone-800 text-stone-100 hover:bg-stone-700"
          >
            {rewriting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Ajustează
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_INSTRUCTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={rewriting || !body.trim()}
              onClick={() => rewrite(q)}
              className="rounded-full border border-stone-800/60 px-2 py-0.5 text-[11px] text-stone-400 hover:border-stone-700 hover:text-stone-200 disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Avertismente */}
      {!target && (
        <p className="text-xs text-amber-300/90">Lead-ul nu are {CHANNEL_LABELS[channel]} — completează contactul în detalii ca să poți trimite.</p>
      )}
      {channel === 'email' && (context?.pendingSteps ?? 0) > 0 && (
        <p className="text-xs text-amber-300/90">
          Lead-ul are {context?.pendingSteps} pași automați programați. Un email trimis de aici îi anulează (preia conversația).
        </p>
      )}
      {blockedAuto && <p className="text-xs text-red-400/90">{CHANNEL_LABELS[channel]} nu e configurat pe server.</p>}

      {/* Acțiuni */}
      <div className="flex flex-wrap items-center gap-2">
        {delivery === 'auto' ? (
          <Button
            size="sm"
            disabled={!target || !body.trim() || tooLong || sending || blockedAuto || (channel === 'email' && !subject.trim())}
            onClick={() => (confirming ? record() : setConfirming(true))}
            className={confirming ? 'bg-emerald-500 text-black hover:bg-emerald-400' : 'bg-amber-500 text-black hover:bg-amber-400'}
          >
            {sending ? <Loader2 className="animate-spin" /> : confirming ? <Check /> : <Send />}
            {confirming ? `Confirmă trimiterea către ${target}` : `Trimite ${CHANNEL_LABELS[channel]}`}
          </Button>
        ) : (
          <>
            <Button size="sm" disabled={!target || !body.trim() || tooLong} onClick={openManual} className="bg-amber-500 text-black hover:bg-amber-400">
              <Copy />
              Copiază și deschide {CHANNEL_LABELS[channel]}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!target || !body.trim() || sending}
              onClick={record}
              title={opened ? undefined : 'Folosește după ce ai trimis mesajul în aplicație'}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Check />}
              Am trimis — înregistrează
            </Button>
          </>
        )}
        {channel === 'email' && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={syncing}
              onClick={syncReplies}
              className="text-stone-400 hover:text-stone-100 hover:bg-stone-800 ml-auto"
              title="Caută acum în Gmail răspunsurile la emailurile trimise și actualizează etapa"
            >
              {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Verifică răspunsurile
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={savingPitch || !body.trim()}
              onClick={savePitch}
              className="text-stone-400 hover:text-stone-100 hover:bg-stone-800"
              title="Salvează subiectul și textul ca pitch-ul lead-ului"
            >
              {savingPitch ? <Loader2 className="animate-spin" /> : <Save />}
              Salvează ca pitch
            </Button>
          </>
        )}
      </div>
      {delivery === 'manual' && (
        <p className="text-[11px] text-stone-600">
          {CHANNEL_LABELS[channel]} nu permite trimiterea primului mesaj din aplicații externe: CRM-ul copiază textul și deschide
          conversația, iar după ce îl trimiți îl înregistrezi aici (apare în „Mesaje trimise” și în Overview).
        </p>
      )}
    </div>
  );
}

const inputClass =
  'w-full bg-stone-950/60 border border-stone-800/60 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40';
