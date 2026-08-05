// src/app/(dashboard)/messaging/page.tsx
'use client';
import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

interface ChatSession {
  sessionId: string;
  clientEmail: string | null;
  clientPhone: string | null;
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
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/messaging/sessions');
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      setSessions(data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (sessionId: string) => {
    setLoadingMessages(true);
    try {
      const response = await fetch(`/api/messaging/messages?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch messages');
      const data = await response.json();
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSessionSelect = (session: ChatSession) => {
    setSelectedSession(session);
    fetchMessages(session.sessionId);
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
          <p className="text-sm text-gray-400">{sessions.length} sesiuni</p>
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
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    session.status === 'active'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {session.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(session.startedAt).toLocaleDateString('ro-RO')}
                  </span>
                </div>

                <div className="text-sm text-white mb-1">
                  {session.clientEmail || session.clientPhone || 'Client anonim'}
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
            <div className="p-4 border-b border-neutral-800 bg-neutral-900">
              <h3 className="text-lg font-semibold text-white">
                Conversație cu {selectedSession.clientEmail || selectedSession.clientPhone || 'Client'}
              </h3>
              <div className="flex gap-4 text-sm text-gray-400 mt-1">
                <span>Început: {new Date(selectedSession.startedAt).toLocaleString('ro-RO')}</span>
                {selectedSession.endedAt && (
                  <span>Sfârșit: {new Date(selectedSession.endedAt).toLocaleString('ro-RO')}</span>
                )}
              </div>
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
                          : 'bg-neutral-700 text-gray-100'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
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