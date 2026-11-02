// src/app/(dashboard)/messaging/page.tsx
'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useLiveRefresh } from '@/hooks/use-live-refresh';

export const dynamic = 'force-dynamic';

/** Conversațiile cu agentul de pe site trebuie să apară aproape instant. */
const REFRESH_MS = 5_000;

interface ChatSession {
  sessionId: string;
  clientEmail: string | null;
  clientPhone: string | null;
  clientName: string | null;
  takenByHuman: boolean;
  startedAt: string;
  endedAt: string | null;
  status: string;
  firstMessage: string | null;
  messageCount: number;
  bookedConsultation: boolean;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
}

export default function MessagingPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [togglingTakeover, setTogglingTakeover] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  // Sesiunea deschisă acum — un răspuns întârziat pentru alta e ignorat
  const selectedRef = useRef<string | null>(null);

  // Derivată din listă, ca statusul (ex. „booked”) să se actualizeze și în antet
  const selectedSession = sessions.find((s) => s.sessionId === selectedId) ?? null;

  // `quiet`: reîncărcare în fundal — fără spinner și fără să golească lista la o eroare
  const fetchSessions = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/messaging/sessions', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      if (!quiet) setSessions([]);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const fetchMessages = useCallback(async (sessionId: string, quiet = false) => {
    if (!quiet) setLoadingMessages(true);
    try {
      const response = await fetch(`/api/messaging/messages?sessionId=${encodeURIComponent(sessionId)}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      if (selectedRef.current === sessionId) setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      if (!quiet) setMessages([]);
    } finally {
      if (!quiet) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useLiveRefresh(
    useCallback(async () => {
      const open = selectedRef.current;
      await Promise.all([fetchSessions(true), open ? fetchMessages(open, true) : null]);
    }, [fetchSessions, fetchMessages]),
    REFRESH_MS
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [selectedId, messages.length]);

  const handleSessionSelect = (session: ChatSession) => {
    selectedRef.current = session.sessionId;
    setSelectedId(session.sessionId);
    setMessages([]);
    setReply('');
    setActionError(null);
    fetchMessages(session.sessionId);
  };

  // Cât timp e preluată, agentul AI de pe site nu mai răspunde vizitatorului
  const setTakeover = async (takenByHuman: boolean) => {
    if (!selectedId) return;
    setTogglingTakeover(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/messaging/sessions/${encodeURIComponent(selectedId)}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taken_by_human: takenByHuman }),
      });
      if (!response.ok) throw new Error('Failed to update takeover');
      setSessions((prev) => prev.map((s) => (s.sessionId === selectedId ? { ...s, takenByHuman } : s)));
    } catch (error) {
      console.error('Error updating takeover:', error);
      setActionError('Nu am putut actualiza conversația. Încearcă din nou.');
    } finally {
      setTogglingTakeover(false);
    }
  };

  const sendReply = async () => {
    const content = reply.trim();
    if (!selectedId || !content || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const response = await fetch('/api/messaging/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: selectedId, content }),
      });
      if (!response.ok) throw new Error('Failed to send message');
      const message: ChatMessage = await response.json();
      setReply('');
      if (selectedRef.current === message.sessionId) setMessages((prev) => [...prev, message]);
      // Trimiterea preia automat conversația
      setSessions((prev) => prev.map((s) => (s.sessionId === selectedId ? { ...s, takenByHuman: true } : s)));
    } catch (error) {
      console.error('Error sending reply:', error);
      setActionError('Mesajul nu a putut fi trimis. Încearcă din nou.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-stone-500">
          <div className="w-5 h-5 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
          <span>Se încarcă conversațiile...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sessions List */}
      <div className="w-80 bg-neutral-900 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-lg font-semibold text-white">Conversații cu Agentul</h2>
          <p className="flex items-center gap-2 text-sm text-gray-400">
            {sessions.length} sesiuni
            <span className="flex items-center gap-1 text-xs text-green-400" title="Se actualizează automat">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Live
            </span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              Nu există conversații încă
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.sessionId}
                onClick={() => handleSessionSelect(session)}
                className={`p-4 border-b border-neutral-800 cursor-pointer hover:bg-neutral-800 transition ${
                  selectedSession?.sessionId === session.sessionId ? 'bg-neutral-800' : ''
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex gap-1">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      session.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}>
                      {session.status}
                    </span>
                    {session.takenByHuman && (
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-400">
                        preluată
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">
                    {new Date(session.startedAt).toLocaleDateString('ro-RO')}
                  </span>
                </div>

                <div className="text-sm text-white mb-1">
                  {session.clientName || session.clientEmail || session.clientPhone || 'Client anonim'}
                </div>

                {session.firstMessage && (
                  <div className="text-xs text-gray-400 truncate">
                    {session.firstMessage}
                  </div>
                )}

                <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                  <span>{session.messageCount} mesaje</span>
                  {session.bookedConsultation && (
                    <span className="text-green-400">✓ Rezervare</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages Panel */}
      <div className="flex-1 flex flex-col">
        {selectedSession ? (
          <>
            <div className="p-4 border-b border-neutral-800 bg-neutral-900 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  Conversație cu {selectedSession.clientName || selectedSession.clientEmail || selectedSession.clientPhone || 'Client'}
                </h3>
                <div className="flex gap-4 text-sm text-gray-400 mt-1">
                  <span>Început: {new Date(selectedSession.startedAt).toLocaleString('ro-RO')}</span>
                  {selectedSession.endedAt && (
                    <span>Sfârșit: {new Date(selectedSession.endedAt).toLocaleString('ro-RO')}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setTakeover(!selectedSession.takenByHuman)}
                disabled={togglingTakeover}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  selectedSession.takenByHuman
                    ? 'bg-neutral-800 border border-neutral-700 text-gray-200 hover:bg-neutral-700'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                }`}
              >
                {selectedSession.takenByHuman ? 'Predă agentului AI' : 'Preia conversația'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {loadingMessages ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  Nu există mesaje în această conversație
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-orange-500 text-white'
                          : message.role === 'human'
                            ? 'bg-amber-900/40 border border-amber-500/40 text-gray-100'
                            : 'bg-neutral-700 text-gray-100'
                      }`}
                    >
                      {message.role === 'human' && (
                        <span className="text-[10px] uppercase tracking-wider text-amber-400 block mb-1">Operator</span>
                      )}
                      <p className="text-sm whitespace-pre-line">{message.content}</p>
                      <span className="text-xs opacity-70 mt-1 block">
                        {new Date(message.createdAt).toLocaleTimeString('ro-RO', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottom} />
            </div>

            <div className="p-4 border-t border-neutral-800 bg-neutral-900">
              {actionError && <p className="text-sm text-red-400 mb-2">{actionError}</p>}
              <div className="flex gap-2">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder={selectedSession.takenByHuman
                    ? 'Scrie un mesaj vizitatorului...'
                    : 'Scrie un mesaj — trimiterea preia conversația de la agentul AI'}
                  className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none transition resize-none"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="px-5 rounded-xl bg-orange-500 text-white font-medium hover:bg-orange-600 transition disabled:opacity-50"
                >
                  {sending ? '...' : 'Trimite'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Mesajul apare în chatul de pe site doar cât timp vizitatorul are pagina deschisă.
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">💬</div>
              <p>Selectează o conversație pentru a vedea mesajele</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}