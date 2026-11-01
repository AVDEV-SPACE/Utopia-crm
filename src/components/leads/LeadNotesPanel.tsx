'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, Pencil, Check, X, RefreshCw,
  StickyNote, Phone, Users, Mail, MessageCircle, GitBranch,
  Smartphone, Instagram, Facebook, Linkedin, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StageBadge } from '@/components/pipeline/StageBadge';
import type { LeadNote, NoteKind } from '@/services/leads/notes';
import type { TimelineEvent, TimelineItem, TimelineMessage } from '@/services/leads/timeline';

/** Tipurile pe care le poate alege utilizatorul ('status' e generat automat). */
const KIND_OPTIONS: { value: Exclude<NoteKind, 'status'>; label: string }[] = [
  { value: 'note', label: 'Notă' },
  { value: 'call', label: 'Apel' },
  { value: 'meeting', label: 'Întâlnire' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const KIND_META: Record<NoteKind, { label: string; icon: typeof StickyNote }> = {
  note:     { label: 'Notă',      icon: StickyNote },
  call:     { label: 'Apel',      icon: Phone },
  meeting:  { label: 'Întâlnire', icon: Users },
  email:    { label: 'Email',     icon: Mail },
  whatsapp: { label: 'WhatsApp',  icon: MessageCircle },
  status:   { label: 'Status',    icon: GitBranch },
};

const CHANNEL_META: Record<string, { label: string; icon: typeof Mail }> = {
  email:     { label: 'Email',     icon: Mail },
  sms:       { label: 'SMS',       icon: Smartphone },
  whatsapp:  { label: 'WhatsApp',  icon: MessageCircle },
  instagram: { label: 'Instagram', icon: Instagram },
  facebook:  { label: 'Facebook',  icon: Facebook },
  linkedin:  { label: 'LinkedIn',  icon: Linkedin },
};

const INTENT_LABELS: Record<string, string> = {
  interested: 'Interesat',
  question: 'Întrebare',
  objection: 'Obiecție',
  not_interested: 'Refuz',
  unsubscribe: 'Dezabonare',
  out_of_office: 'Răspuns automat',
  neutral: 'Neutru',
};

const EVENT_LABELS: Record<string, string> = {
  email_opened: 'Email deschis',
  stage_changed: 'Etapă schimbată',
  unsubscribed: 'S-a dezabonat',
};

/** Mesajele mai lungi de atât se arată restrânse. */
const COLLAPSED_CHARS = 600;

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Un rând din istoric: notă (editabilă), mesaj sau eveniment. */
type Entry = { kind: 'note'; at: string; note: LeadNote } | { kind: 'item'; at: string; item: TimelineItem };

/**
 * Tab-ul „Istoric” din fișa lead-ului: notele echipei și conversația cu
 * lead-ul pe toate canalele (trimise și primite), plus evenimentele din
 * pipeline — toate într-o singură listă, cele mai noi sus.
 */
export function LeadNotesPanel({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Exclude<NoteKind, 'status'>>('note');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  const fetchHistory = useCallback(async () => {
    try {
      const [notesRes, timelineRes] = await Promise.all([
        fetch(`/api/leads/${leadId}/notes`),
        fetch(`/api/leads/${leadId}/timeline`),
      ]);
      const [notesData, timelineData] = await Promise.all([notesRes.json(), timelineRes.json()]);
      if (!notesRes.ok) throw new Error(notesData.error ?? 'Nu am putut încărca istoricul');
      if (!timelineRes.ok) throw new Error(timelineData.error ?? 'Nu am putut încărca conversația');
      setNotes(notesData as LeadNote[]);
      setTimeline(timelineData as TimelineItem[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcarea istoricului');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    setLoading(true);
    fetchHistory();
  }, [fetchHistory]);

  async function refresh() {
    setRefreshing(true);
    await fetchHistory();
    setRefreshing(false);
  }

  async function handleAdd() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la salvarea notei');
      setNotes((prev) => [data as LeadNote, ...prev]);
      setBody('');
      toast.success('Notă adăugată.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la salvarea notei');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(noteId: string) {
    if (!editingBody.trim()) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/notes/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editingBody }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la actualizare');
      setNotes((prev) => prev.map((n) => (n.id === noteId ? (data as LeadNote) : n)));
      setEditingId(null);
      toast.success('Notă actualizată.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la actualizare');
    }
  }

  async function handleDelete(noteId: string) {
    const previous = notes;
    setNotes((prev) => prev.filter((n) => n.id !== noteId)); // optimist
    try {
      const res = await fetch(`/api/leads/${leadId}/notes/${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Eroare la ștergere');
      toast.success('Notă ștearsă.');
    } catch (err) {
      setNotes(previous); // revenire dacă serverul a refuzat
      toast.error(err instanceof Error ? err.message : 'Eroare la ștergere');
    }
  }

  const entries: Entry[] = [
    ...notes.map((note): Entry => ({ kind: 'note', at: new Date(note.created_at).toISOString(), note })),
    ...timeline.map((item): Entry => ({ kind: 'item', at: item.at, item })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-4">
      {/* Adăugare */}
      <div className="rounded-xl border border-stone-800/60 p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setKind(opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                kind === opt.value
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Ce s-a discutat, ce s-a stabilit, pașii următori..."
          className="w-full rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />

        <div className="flex justify-end">
          <Button size="sm" disabled={saving || !body.trim()} onClick={handleAdd}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            Adaugă în istoric
          </Button>
        </div>
      </div>

      <div className="flex items-center">
        <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Conversație și istoric</h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={refresh}
          disabled={refreshing || loading}
          className="ml-auto h-7 text-xs text-stone-400 hover:text-stone-200"
        >
          <RefreshCw className={refreshing ? 'animate-spin' : ''} />
          Reîmprospătează
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-stone-500">
          <Loader2 className="animate-spin mr-2" size={16} /> Se încarcă istoricul...
        </div>
      ) : error ? (
        <p className="text-center py-10 text-sm text-red-400">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-center py-10 text-sm text-stone-500">
          Niciun mesaj sau eveniment încă. Mesajele trimise, răspunsurile și notele apar aici.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry) => {
            if (entry.kind === 'item') {
              return entry.item.type === 'message' ? (
                <MessageEntry key={entry.item.id} message={entry.item} />
              ) : (
                <EventEntry key={entry.item.id} event={entry.item} />
              );
            }

            const note = entry.note;
            const meta = KIND_META[note.kind] ?? KIND_META.note;
            const Icon = meta.icon;
            const isAuto = note.kind === 'status';
            const isEditing = editingId === note.id;

            return (
              <li
                key={`note:${note.id}`}
                className={`rounded-xl border border-stone-800/60 p-3 ${isAuto ? 'bg-stone-900/40' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Icon size={13} className="text-stone-500 shrink-0" />
                  <span className="text-xs font-medium text-stone-300">{meta.label}</span>
                  <span className="text-xs text-stone-600">·</span>
                  <span className="text-xs text-stone-500">{formatDate(note.created_at)}</span>
                  {note.author_name && (
                    <>
                      <span className="text-xs text-stone-600">·</span>
                      <span className="text-xs text-stone-500 truncate">{note.author_name}</span>
                    </>
                  )}

                  {/* Notele de status sunt generate automat — nu se editează */}
                  {!isAuto && !isEditing && (
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => { setEditingId(note.id); setEditingBody(note.body); }}
                        className="text-stone-500 hover:text-stone-300 p-1"
                        title="Editează nota"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="text-stone-500 hover:text-red-400 p-1"
                        title="Șterge nota"
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingBody}
                      onChange={(e) => setEditingBody(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-stone-800 bg-stone-950/60 p-2 text-sm text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                        <X /> Renunță
                      </Button>
                      <Button size="sm" disabled={!editingBody.trim()} onClick={() => handleSaveEdit(note.id)}>
                        <Check /> Salvează
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-stone-300 whitespace-pre-wrap leading-relaxed">{note.body}</p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Un mesaj trimis (dreapta, amber) sau primit (stânga, neutru), pe orice canal. */
function MessageEntry({ message }: { message: TimelineMessage }) {
  const [expanded, setExpanded] = useState(false);
  const channel = CHANNEL_META[message.channel] ?? { label: message.channel, icon: Mail };
  const ChannelIcon = channel.icon;
  const incoming = message.direction === 'in';
  const DirectionIcon = incoming ? ArrowDownLeft : ArrowUpRight;
  const long = message.body.length > COLLAPSED_CHARS;
  const text = long && !expanded ? `${message.body.slice(0, COLLAPSED_CHARS).trimEnd()}…` : message.body;

  return (
    <li className={incoming ? 'pr-8' : 'pl-8'}>
      <div
        className={`rounded-xl border p-3 ${
          incoming ? 'border-stone-700/60 bg-stone-800/30' : 'border-amber-500/20 bg-amber-500/[0.04]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          <DirectionIcon size={13} className={incoming ? 'text-sky-400' : 'text-amber-400'} />
          <span className="text-xs font-medium text-stone-300">{incoming ? 'Primit' : 'Trimis'}</span>
          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
            <ChannelIcon size={12} /> {channel.label}
          </span>
          <span className="text-xs text-stone-600">·</span>
          <span className="text-xs text-stone-500">{formatDate(message.at)}</span>
          {message.author && <span className="text-xs text-stone-600 truncate max-w-[200px]">· {message.author}</span>}
          {message.failed && <span className="text-[11px] text-red-400">eșuat</span>}
          {message.intent && (
            <span
              title={message.summary ?? undefined}
              className="ml-auto inline-flex items-center px-2 py-0.5 rounded-md border border-stone-700/60 text-[11px] text-stone-300"
            >
              {INTENT_LABELS[message.intent] ?? message.intent}
            </span>
          )}
        </div>
        {message.subject && <p className="text-xs font-medium text-stone-400 mb-1">{message.subject}</p>}
        <p className="text-sm text-stone-200 whitespace-pre-wrap leading-relaxed break-words">
          {text || <span className="text-stone-600 italic">(fără text)</span>}
        </p>
        {long && (
          <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs text-amber-400 hover:underline">
            {expanded ? 'Arată mai puțin' : 'Arată tot'}
          </button>
        )}
        {message.summary && incoming && <p className="mt-1.5 text-[11px] text-stone-500 italic">AI: {message.summary}</p>}
      </div>
    </li>
  );
}

/** Un eveniment din pipeline (deschidere, schimbare de etapă) — un rând discret. */
function EventEntry({ event }: { event: TimelineEvent }) {
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs text-stone-500">
      <GitBranch size={12} className="shrink-0" />
      <span className="text-stone-400">{EVENT_LABELS[event.event] ?? event.event}</span>
      {event.channel && <span>· {CHANNEL_META[event.channel]?.label ?? event.channel}</span>}
      {event.stage && <StageBadge stage={event.stage} />}
      <span className="ml-auto">{formatDate(event.at)}</span>
    </li>
  );
}
