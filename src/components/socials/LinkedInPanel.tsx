'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Linkedin, Loader2, RefreshCw, Unplug, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { LinkedInStatus } from '@/services/social/linkedin/status';

const CHECK_LABELS = {
  token: 'Token de acces',
  admin: 'Rol de admin pe pagină',
  page: 'Pagina de companie',
} as const;

const dateFormatter = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Tab-ul LinkedIn din /socials: conectarea paginii de companie (OAuth, o dată,
 * de către un admin al paginii), starea tokenului și sincronizarea comentariilor.
 * Postările pe LinkedIn se fac din tab-ul „Postări”, comentariile apar în Inbox.
 */
export function LinkedInPanel() {
  const [status, setStatus] = useState<LinkedInStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'sync' | 'disconnect' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/socials/linkedin/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut verifica LinkedIn');
      setStatus(data as LinkedInStatus);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setBusy('sync');
    try {
      const res = await fetch('/api/socials/linkedin/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.errors?.[0] ?? data.error ?? 'Sincronizarea a eșuat');
      toast.success(`${data.newComments} comentarii noi din ${data.posts} postări`);
      if (data.errors?.length) toast.warning(data.errors[0]);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sincronizarea a eșuat');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      const res = await fetch('/api/socials/linkedin/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut deconecta');
      toast.success('LinkedIn deconectat');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut deconecta');
    } finally {
      setBusy(null);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-stone-500">
        <Loader2 size={14} className="mr-2 animate-spin" /> Se verifică LinkedIn...
      </div>
    );
  }
  if (!status) return null;

  const connection = status.connection;
  const expiringSoon = status.daysLeft !== null && status.daysLeft < 10 && !connection?.has_refresh_token;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-stone-800/60 bg-stone-900/60 p-4">
        <div className="flex items-center gap-2">
          <Linkedin size={15} className="text-stone-400" />
          <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Pagina de companie LinkedIn</h3>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="ml-auto h-7 text-xs text-stone-400">
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Verifică din nou
          </Button>
        </div>

        {status.missingEnv.length > 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Lipsesc variabilele: {status.missingEnv.join(', ')} (în .env local și pe Vercel).
          </p>
        )}

        {status.redirectUri && (
          <div className="space-y-1">
            <p className="text-xs text-stone-500">Redirect URL (aplicația LinkedIn → Auth → Authorized redirect URLs):</p>
            <div className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2">
              <code className="flex-1 truncate text-xs text-stone-300">{status.redirectUri}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(status.redirectUri!);
                  toast.success('URL copiat');
                }}
                className="text-stone-500 hover:text-stone-200"
                aria-label="Copiază URL-ul"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        )}

        {status.missingEnv.length === 0 && !connection && (
          <div className="space-y-2">
            <p className="text-sm text-stone-300">Pagina nu e conectată încă.</p>
            <p className="text-xs text-stone-500">
              Conectează-te cu contul LinkedIn care e <b>admin</b> al paginii Utopia Systems. Autorizarea se face o singură dată;
              tokenul se păstrează criptat.
            </p>
            <Button asChild className="bg-amber-500 text-black hover:bg-amber-400">
              <a href="/api/socials/linkedin/connect">
                <Linkedin /> Conectează LinkedIn
              </a>
            </Button>
          </div>
        )}

        {connection && (
          <>
            {status.checks && (
              <ul className="space-y-1.5">
                {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map((key) => {
                  const check = status.checks![key];
                  return (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      {check.ok ? <Check size={15} className="mt-0.5 text-emerald-400" /> : <X size={15} className="mt-0.5 text-red-400" />}
                      <span className="text-stone-300">{CHECK_LABELS[key]}</span>
                      <span className="text-xs text-stone-500 pt-0.5">{check.detail}</span>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="grid gap-1 text-xs text-stone-500">
              <span>
                Token valabil până la {dateFormatter.format(new Date(connection.access_expires_at))}
                {status.daysLeft !== null && ` (${status.daysLeft} zile)`} ·{' '}
                {connection.has_refresh_token ? 'se reînnoiește automat' : 'fără reînnoire automată'}
              </span>
              <span>
                Ultima sincronizare a comentariilor:{' '}
                {connection.last_sync_at ? dateFormatter.format(new Date(connection.last_sync_at)) : 'niciodată'}
              </span>
              {connection.last_error && <span className="text-amber-400/90">Ultima eroare: {connection.last_error}</span>}
            </div>

            {expiringSoon && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Tokenul expiră curând și LinkedIn nu a emis refresh token: reconectează pagina ca postările să nu se oprească.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={sync} disabled={busy !== null}>
                {busy === 'sync' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sincronizează comentariile
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href="/api/socials/linkedin/connect">
                  <Linkedin /> Reconectează
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy !== null} className="text-stone-400">
                {busy === 'disconnect' ? <Loader2 className="animate-spin" /> : <Unplug />} Deconectează
              </Button>
            </div>
          </>
        )}
      </section>

      <p className="text-[11px] text-stone-600 leading-relaxed">
        Postările pe LinkedIn (text, o imagine sau 2–10 imagini) se creează din tab-ul „Postări”. Comentariile de la ultimele postări
        ale paginii apar în Inbox (cron <code>/api/cron/linkedin-sync</code>, recomandat din oră în oră), unde poți răspunde public ca
        pagina. LinkedIn nu permite mesaje directe prin API — mesajele către persoane se trimit manual din fișa lead-ului.
      </p>
    </div>
  );
}
