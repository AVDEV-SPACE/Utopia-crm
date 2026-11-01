'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Facebook, Hand, Instagram, Loader2, MessageSquare, RefreshCw, Reply, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversation, ConversationMessage } from '@/services/followups/types';
import type { SocialConversationSummary } from '@/services/followups/conversations';

type ChannelFilter = 'all' | 'facebook' | 'instagram';

interface Thread {
  conversation: Conversation;
  messages: ConversationMessage[];
  dmWindowEndsAt: string | null;
}

/** Cât de des se reîncarcă inbox-ul cât timp tab-ul e vizibil. */
const REFRESH_MS = 30_000;

const CHANNEL_ICON = { facebook: Facebook, instagram: Instagram } as const;

const timeFormatter = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function displayName(c: Pick<Conversation, 'contact_name' | 'channel' | 'external_user_id'>): string {
  return c.contact_name || `Contact ${c.channel === 'instagram' ? 'Instagram' : 'Facebook'} ${(c.external_user_id ?? '').slice(-6)}`;
}

/**
 * Inbox-ul /socials: conversațiile Facebook / Instagram (DM-uri și comentarii),
 * firul conversației, răspuns manual (DM în fereastra de 24h sau răspuns public
 * la un comentariu) și preluarea de om (AI-ul tace cât timp e activă).
 */
export function SocialInbox() {
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [conversations, setConversations] = useState<SocialConversationSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/socials/conversations${filter === 'all' ? '' : `?channel=${filter}`}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca conversațiile');
      setConversations(data as SocialConversationSummary[]);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setThreadLoading(true);
    try {
      const res = await fetch(`/api/socials/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca conversația');
      setThread(data as Thread);
    } catch (err) {
      if (!quiet) toast.error(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      if (!quiet) setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadList();
  }, [loadList]);

  useEffect(() => {
    setReplyTo(null);
    setText('');
    if (activeId) loadThread(activeId);
    else setThread(null);
  }, [activeId, loadThread]);

  // Reîncărcare periodică (mesaje noi, răspunsurile AI) cât timp pagina e vizibilă
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      loadList();
      if (activeId) loadThread(activeId, true);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [activeId, loadList, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [thread?.messages.length]);

  const windowOpen = thread?.dmWindowEndsAt ? new Date(thread.dmWindowEndsAt).getTime() > Date.now() : false;
  const canSend = Boolean(text.trim()) && (replyTo !== null || windowOpen);

  async function send() {
    if (!thread || !canSend) return;
    setSending(true);
    try {
      const res = await fetch(`/api/socials/conversations/${thread.conversation.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, commentId: replyTo?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut trimite');
      toast.success(replyTo ? 'Răspuns publicat la comentariu' : 'Mesaj trimis');
      setText('');
      setReplyTo(null);
      await Promise.all([loadThread(thread.conversation.id, true), loadList()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut trimite');
    } finally {
      setSending(false);
    }
  }

  async function toggleTakeover() {
    if (!thread) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/socials/conversations/${thread.conversation.id}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken_by_human: !thread.conversation.taken_by_human }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut actualiza conversația');
      setThread({ ...thread, conversation: data as Conversation });
      toast.success(data.taken_by_human ? 'Ai preluat conversația — AI-ul nu mai răspunde' : 'Conversația e eliberată — AI-ul poate răspunde');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      {/* Lista conversațiilor */}
      <div className="rounded-xl border border-stone-800/60 bg-stone-900/60">
        <div className="flex items-center gap-1.5 border-b border-stone-800/60 p-3">
          {(['all', 'facebook', 'instagram'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filter === value
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:text-stone-400'
              }`}
            >
              {value === 'all' ? 'Toate' : value === 'facebook' ? 'Facebook' : 'Instagram'}
            </button>
          ))}
          <button onClick={() => loadList()} className="ml-auto p-1 text-stone-500 hover:text-stone-200" aria-label="Reîmprospătează">
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-stone-500">
            <Loader2 size={14} className="mr-2 animate-spin" /> Se încarcă...
          </div>
        ) : listError ? (
          <p className="p-4 text-sm text-red-400">{listError}</p>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-sm text-stone-500">
            Nicio conversație încă. Mesajele și comentariile primite pe pagină și pe Instagram apar aici.
          </p>
        ) : (
          <ul className="max-h-[65vh] overflow-y-auto">
            {conversations.map((c) => {
              const Icon = CHANNEL_ICON[c.channel as 'facebook' | 'instagram'] ?? MessageSquare;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={`w-full border-b border-stone-800/40 px-3 py-2.5 text-left hover:bg-stone-800/30 ${
                      activeId === c.id ? 'bg-stone-800/40' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={13} className="shrink-0 text-stone-400" />
                      <span className="truncate text-sm font-medium text-stone-200">{displayName(c)}</span>
                      {c.taken_by_human && <Hand size={12} className="shrink-0 text-amber-400" aria-label="Preluată de om" />}
                      <span className="ml-auto shrink-0 text-[11px] text-stone-600">{timeFormatter.format(new Date(c.last_message_at))}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      {c.last_kind === 'comment' && <span className="text-stone-600">Comentariu · </span>}
                      {c.last_role && c.last_role !== 'user' && <span className="text-stone-600">Tu: </span>}
                      {c.last_body ?? '—'}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Firul conversației */}
      <div className="flex min-h-[420px] flex-col rounded-xl border border-stone-800/60 bg-stone-900/60">
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-stone-500">Alege o conversație din listă.</div>
        ) : threadLoading || !thread ? (
          <div className="flex flex-1 items-center justify-center text-sm text-stone-500">
            <Loader2 size={14} className="mr-2 animate-spin" /> Se încarcă...
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-stone-800/60 px-4 py-3">
              <span className="text-sm font-semibold text-stone-100">{displayName(thread.conversation)}</span>
              <span className="text-xs text-stone-500">{thread.conversation.channel === 'instagram' ? 'Instagram' : 'Facebook'}</span>
              {thread.conversation.lead_id && (
                <Link href={`/pipeline?lead=${thread.conversation.lead_id}`} className="text-xs text-amber-400 hover:underline">
                  Fișa lead-ului
                </Link>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={toggling}
                onClick={toggleTakeover}
                className="ml-auto"
                title="Cât timp e preluată de om, AI-ul nu răspunde"
              >
                {toggling ? <Loader2 className="animate-spin" /> : <Hand />}
                {thread.conversation.taken_by_human ? 'Eliberează (AI poate răspunde)' : 'Preia conversația'}
              </Button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4 max-h-[55vh]">
              {thread.messages.map((m) => {
                const incoming = m.role === 'user';
                return (
                  <div key={m.id} className={incoming ? 'pr-10' : 'pl-10'}>
                    <div
                      className={`rounded-xl border p-3 ${
                        incoming ? 'border-stone-700/60 bg-stone-800/30' : 'border-amber-500/20 bg-amber-500/[0.04]'
                      }`}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
                        <span className="font-medium text-stone-400">
                          {incoming ? 'Client' : m.role === 'assistant' ? 'AI' : 'Tu'}
                        </span>
                        {m.kind === 'comment' && <span className="rounded border border-stone-700/60 px-1.5">Comentariu public</span>}
                        <span>{timeFormatter.format(new Date(m.created_at))}</span>
                        {incoming && m.kind === 'comment' && (
                          <button onClick={() => setReplyTo(m)} className="ml-auto inline-flex items-center gap-1 text-amber-400 hover:underline">
                            <Reply size={11} /> Răspunde public
                          </button>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-stone-200">{m.body}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </div>

            <div className="space-y-2 border-t border-stone-800/60 p-3">
              {replyTo ? (
                <div className="flex items-center gap-2 rounded-lg bg-stone-950/40 px-3 py-1.5 text-xs text-stone-400">
                  <Reply size={12} /> Răspuns public la: <span className="truncate text-stone-300">{replyTo.body}</span>
                  <button onClick={() => setReplyTo(null)} className="ml-auto text-stone-500 hover:text-stone-200" aria-label="Anulează">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <p className={`text-[11px] ${windowOpen ? 'text-stone-600' : 'text-amber-400/90'}`}>
                  {windowOpen
                    ? `DM permis până la ${timeFormatter.format(new Date(thread.dmWindowEndsAt!))} (fereastra de 24h a Meta).`
                    : 'Fereastra de 24h a expirat (sau clientul nu a scris în DM): Meta nu permite mesaj direct până nu scrie din nou. Poți răspunde public la comentarii.'}
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder={replyTo ? 'Răspunsul public...' : 'Mesajul tău...'}
                  className="flex-1 rounded-lg border border-stone-800 bg-stone-950/60 p-2 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40"
                />
                <Button onClick={send} disabled={!canSend || sending} className="self-end bg-amber-500 text-black hover:bg-amber-400">
                  {sending ? <Loader2 className="animate-spin" /> : <Send />}
                  Trimite
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
