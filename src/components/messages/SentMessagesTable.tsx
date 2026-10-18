'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  CornerDownRight,
  ExternalLink,
  Instagram,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Smartphone,
} from 'lucide-react';
import { MessageChannel, SentMessage } from '@/services/messages/types';

interface SentMessagesTableProps {
  /** Limitează jurnalul la un singur lead (ex. din fișa lead-ului). */
  leadId?: string;
  /** Doar lead-uri sau doar clienți; implicit toate. */
  recipientType?: 'lead' | 'client';
  emptyMessage?: string;
}

const CHANNEL_FILTERS: { value: 'all' | MessageChannel; label: string }[] = [
  { value: 'all', label: 'Toate' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const CHANNEL_ICONS: Record<MessageChannel, typeof Mail> = {
  email: Mail,
  sms: Smartphone,
  whatsapp: MessageCircle,
  instagram: Instagram,
};

const CHANNEL_LABELS: Record<MessageChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

/** Pitch-urile sunt HTML — în tabel afișăm doar textul. */
function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function SentMessagesTable({ leadId, recipientType, emptyMessage }: SentMessagesTableProps) {
  const [messages, setMessages] = useState<SentMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | MessageChannel>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // `silent`: reîncărcare după sincronizare, fără să înlocuiască tabelul cu spinner-ul
  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (leadId) params.set('leadId', leadId);
      if (recipientType) params.set('type', recipientType);

      const res = await fetch(`/api/sent-messages?${params}`);
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error || 'Nu am putut încărca jurnalul de mesaje');
      }
      setMessages(await res.json());
      setError(null);
    } catch (err) {
      console.error(err);
      setMessages([]);
      setError(err instanceof Error ? err.message : 'Eroare la încărcarea mesajelor');
    } finally {
      setLoading(false);
    }
  }, [channelFilter, leadId, recipientType]);

  /**
   * Caută în Gmail răspunsuri la emailurile trimise. Întoarce `true` dacă a
   * găsit răspunsuri noi (jurnalul trebuie reîncărcat). Serverul limitează
   * frecvența; `force` o ignoră (butonul „Reîmprospătează”).
   */
  const syncReplies = useCallback(async (force = false) => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sent-messages/replies${force ? '?force=1' : ''}`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setSyncError(data?.error ?? 'Nu am putut verifica răspunsurile din Gmail.');
        return false;
      }
      setSyncError(null);
      return (data?.matched ?? 0) > 0;
    } catch {
      setSyncError('Nu am putut verifica răspunsurile din Gmail.');
      return false;
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchMessages();
      if ((await syncReplies()) && !cancelled) fetchMessages(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMessages, syncReplies]);

  const refresh = async () => {
    await fetchMessages();
    if (await syncReplies(true)) fetchMessages(true);
  };

  // Căutarea e locală — jurnalul afișat e deja limitat la ultimele trimiteri
  const visibleMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      [m.recipient_name, m.recipient_email, m.recipient_phone, m.subject, m.template_title]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(q))
    );
  }, [messages, search]);

  const counts = useMemo(
    () => ({
      total: messages.length,
      failed: messages.filter((m) => m.status === 'failed').length,
      replied: messages.filter((m) => m.replied_at).length,
    }),
    [messages]
  );

  return (
    <div className="space-y-3">
      {/* Bara de filtre */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {CHANNEL_FILTERS.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setChannelFilter(filter.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                channelFilter === filter.value
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-45">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-600" size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută după destinatar sau subiect..."
            className="w-full bg-stone-900/60 border border-stone-800/60 rounded-lg pl-9 pr-3 py-1.5 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-stone-700"
          />
        </div>

        <button
          onClick={refresh}
          disabled={loading || syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-900/60 text-stone-400 border border-stone-800/60 hover:border-stone-700 hover:text-stone-300 transition disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading || syncing ? 'animate-spin' : ''} />
          Reîmprospătează
        </button>
      </div>

      {(counts.total > 0 || syncing || syncError) && (
        <p className="text-xs text-stone-500">
          {counts.total > 0 && <>{counts.total} trimiteri înregistrate</>}
          {counts.replied > 0 && <span className="text-sky-400"> · {counts.replied} cu răspuns</span>}
          {counts.failed > 0 && <span className="text-red-400"> · {counts.failed} eșuate</span>}
          {syncing && <span className="text-stone-600"> · se verifică răspunsurile în Gmail…</span>}
          {syncError && <span className="text-amber-400"> · {syncError}</span>}
        </p>
      )}

      {/* Tabel */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-stone-500">
          <Loader2 className="animate-spin mr-2" size={18} /> Se încarcă mesajele trimise...
        </div>
      ) : error ? (
        <div className="text-center py-16 text-sm text-red-400">{error}</div>
      ) : visibleMessages.length === 0 ? (
        <div className="text-center py-16 text-stone-500 text-sm">
          {search.trim()
            ? `Niciun mesaj pentru căutarea „${search.trim()}”.`
            : emptyMessage ?? 'Niciun mesaj trimis încă.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-800/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-800/60 text-left text-stone-500 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Canal</th>
                <th className="px-4 py-3 font-medium">Destinatar</th>
                <th className="px-4 py-3 font-medium">Subiect / Mesaj</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {visibleMessages.map((msg) => {
                const ChannelIcon = CHANNEL_ICONS[msg.channel] ?? Send;
                const expanded = expandedId === msg.id;
                const preview = toPlainText(msg.body);
                return (
                  <Fragment key={msg.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : msg.id)}
                      className="border-b border-stone-800/40 last:border-0 hover:bg-stone-800/20 cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-stone-400 text-xs">
                        {new Date(msg.created_at).toLocaleString('ro-RO', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-stone-300">
                          <ChannelIcon size={13} className="text-stone-500" />
                          {CHANNEL_LABELS[msg.channel] ?? msg.channel}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-medium text-stone-200">
                          {msg.recipient_name || 'Fără nume'}
                        </p>
                        <p className="text-xs text-stone-500 break-all">
                          {msg.recipient_email || msg.recipient_phone || '—'}
                          <span className="ml-1.5 text-stone-600">
                            · {msg.recipient_type === 'lead' ? 'lead' : 'client'}
                          </span>
                        </p>
                      </td>

                      <td className="px-4 py-3 max-w-md">
                        <p className="text-stone-300 truncate">
                          {msg.subject || msg.template_title || '—'}
                        </p>
                        <p className="text-xs text-stone-600 truncate">{preview}</p>
                      </td>

                      <td className="px-4 py-3">
                        {msg.replied_at ? (
                          <span
                            title={`Răspuns primit pe ${new Date(msg.replied_at).toLocaleString('ro-RO')}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 whitespace-nowrap"
                          >
                            <CornerDownRight size={12} />
                            Răspuns primit
                          </span>
                        ) : msg.status === 'sent' ? (
                          <span
                            title={
                              msg.source === 'lead'
                                ? 'Lead marcat ca trimis înainte de jurnalizare — conținutul exact nu a fost salvat'
                                : undefined
                            }
                            className="inline-block px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          >
                            {msg.source === 'lead' ? 'Trimis (istoric)' : 'Trimis'}
                          </span>
                        ) : (
                          <span
                            title={msg.error ?? undefined}
                            className="inline-block px-2 py-1 rounded-lg text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20"
                          >
                            Eșuat
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {msg.gmail_url && (
                          <a
                            href={msg.gmail_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Deschide emailul trimis în Gmail"
                            aria-label="Deschide emailul trimis în Gmail"
                            className="inline-flex align-middle p-1.5 mr-1 rounded-md text-stone-500 hover:text-stone-100 hover:bg-stone-800/60"
                          >
                            <ExternalLink size={14} />
                          </a>
                        )}
                        <ChevronDown
                          size={15}
                          className={`inline align-middle text-stone-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </td>
                    </tr>

                    {expanded && (
                      <tr className="border-b border-stone-800/40 last:border-0">
                        <td colSpan={6} className="px-4 py-4 bg-stone-900/40">
                          {msg.status === 'failed' && msg.error && (
                            <p className="text-xs text-red-400 mb-2">Eroare: {msg.error}</p>
                          )}
                          {msg.template_title && (
                            <p className="text-xs text-stone-500 mb-2">Șablon: {msg.template_title}</p>
                          )}
                          <p className="text-xs text-stone-300 whitespace-pre-wrap leading-relaxed">
                            {preview}
                          </p>
                          {msg.gmail_url && (
                            <a
                              href={msg.gmail_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-amber-400 hover:underline"
                            >
                              <ExternalLink size={12} />
                              {msg.message_id
                                ? 'Deschide emailul trimis în Gmail'
                                : 'Caută emailul în Gmail (trimis înainte de legătura directă)'}
                            </a>
                          )}
                          {msg.replied_at && (
                            <div className="mt-4 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
                              <p className="text-xs font-medium text-sky-400 mb-1">
                                Răspuns · {new Date(msg.replied_at).toLocaleString('ro-RO')}
                              </p>
                              {msg.reply_subject && <p className="text-xs text-stone-300 mb-1">{msg.reply_subject}</p>}
                              {msg.reply_snippet ? (
                                <p className="text-xs text-stone-400 whitespace-pre-wrap leading-relaxed">{msg.reply_snippet}</p>
                              ) : msg.source === 'lead' ? (
                                <p className="text-xs text-stone-500">Lead marcat ca „a răspuns” în CRM.</p>
                              ) : null}
                              {msg.reply_gmail_url && (
                                <a
                                  href={msg.reply_gmail_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-sky-400 hover:underline"
                                >
                                  <ExternalLink size={12} />
                                  Deschide răspunsul în Gmail
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
