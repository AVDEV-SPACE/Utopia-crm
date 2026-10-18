'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, Pencil, Check, X,
  StickyNote, Phone, Users, Mail, MessageCircle, GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LeadNote, NoteKind } from '@/services/leads/notes';

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

function formatDate(value: string): string {
  return new Date(value).toLocaleString('ro-RO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function LeadNotesPanel({ leadId }: { leadId: string }) {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Exclude<NoteKind, 'status'>>('note');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/notes`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca istoricul');
      setNotes(data as LeadNote[]);
      setError(null);
    } catch (err) {
      setNotes([]);
      setError(err instanceof Error ? err.message : 'Eroare la încărcarea istoricului');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

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

      {/* Istoric */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-stone-500">
          <Loader2 className="animate-spin mr-2" size={16} /> Se încarcă istoricul...
        </div>
      ) : error ? (
        <p className="text-center py-10 text-sm text-red-400">{error}</p>
      ) : notes.length === 0 ? (
        <p className="text-center py-10 text-sm text-stone-500">
          Niciun eveniment încă. Prima notă adăugată apare aici.
        </p>
      ) : (
        <ol className="space-y-2">
          {notes.map((note) => {
            const meta = KIND_META[note.kind] ?? KIND_META.note;
            const Icon = meta.icon;
            const isAuto = note.kind === 'status';
            const isEditing = editingId === note.id;

            return (
              <li
                key={note.id}
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
