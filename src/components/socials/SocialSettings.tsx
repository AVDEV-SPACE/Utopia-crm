'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Loader2, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SocialConnectionStatus } from '@/services/social/graph';

interface StatusResponse {
  missingEnv: string[];
  verifyTokenSet: boolean;
  webhookUrl: string | null;
  sameTenant: boolean;
  connection: SocialConnectionStatus | null;
  settings: { social_ai_enabled: boolean; human_takeover_minutes: number } | null;
  settingsError: string | null;
}

const CHECK_LABELS: Record<keyof SocialConnectionStatus, string> = {
  token: 'Token System User',
  page: 'Pagina Facebook',
  instagram: 'Contul Instagram Business',
  webhook: 'Webhook abonat la pagină',
};

/**
 * Setările /socials: starea conexiunii Meta (verificări live, fără tokeni),
 * URL-ul webhook-ului și comutatorul auto-reply-ului AI pe DM-uri.
 */
export function SocialSettings() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/socials/status');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut verifica conexiunea');
      setStatus(data as StatusResponse);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleAi(enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/socials/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ social_ai_enabled: enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva');
      setStatus((prev) => (prev ? { ...prev, settings: { human_takeover_minutes: prev.settings?.human_takeover_minutes ?? 3, social_ai_enabled: data.social_ai_enabled } } : prev));
      toast.success(enabled ? 'Auto-reply AI pornit' : 'Auto-reply AI oprit');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-stone-500">
        <Loader2 size={14} className="mr-2 animate-spin" /> Se verifică conexiunea...
      </div>
    );
  }
  if (!status) return null;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-stone-800/60 bg-stone-900/60 p-4">
        <div className="flex items-center">
          <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Conexiunea Meta</h3>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="ml-auto h-7 text-xs text-stone-400">
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Verifică din nou
          </Button>
        </div>

        {status.missingEnv.length > 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Lipsesc variabilele: {status.missingEnv.join(', ')} (în .env local și pe Vercel).
          </p>
        )}
        {!status.sameTenant && status.missingEnv.length === 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            SOCIAL_ORG_ID diferă de tenant-ul contului tău — verifică valoarea (de regulă egală cu CRM_PIPELINE_ORG_ID).
          </p>
        )}

        {status.connection && (
          <ul className="space-y-1.5">
            {(Object.keys(CHECK_LABELS) as (keyof SocialConnectionStatus)[]).map((key) => {
              const check = status.connection![key];
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

        <div className="space-y-1">
          <p className="text-xs text-stone-500">URL-ul webhook-ului (App Dashboard → Webhooks, obiectele Page și Instagram):</p>
          {status.webhookUrl ? (
            <div className="flex items-center gap-2 rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2">
              <code className="flex-1 truncate text-xs text-stone-300">{status.webhookUrl}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(status.webhookUrl!);
                  toast.success('URL copiat');
                }}
                className="text-stone-500 hover:text-stone-200"
                aria-label="Copiază URL-ul"
              >
                <Copy size={14} />
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-300">Setează NEXT_PUBLIC_APP_URL ca să apară URL-ul public.</p>
          )}
          <p className="text-[11px] text-stone-600">
            Verify token: {status.verifyTokenSet ? 'setat (META_WEBHOOK_VERIFY_TOKEN)' : 'lipsește META_WEBHOOK_VERIFY_TOKEN'}. Abonarea paginii:{' '}
            <code>node --env-file=.env node_modules/jiti/lib/jiti-cli.mjs scripts/meta-subscribe.ts</code>
          </p>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-stone-800/60 bg-stone-900/60 p-4">
        <h3 className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">Auto-reply AI</h3>
        {status.settingsError ? (
          <p className="text-xs text-amber-300">{status.settingsError}</p>
        ) : (
          <label className="flex items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={Boolean(status.settings?.social_ai_enabled)}
              disabled={saving}
              onChange={(e) => toggleAi(e.target.checked)}
              className="accent-amber-500"
            />
            Răspunde automat la DM-urile primite pe Facebook și Instagram
          </label>
        )}
        <p className="text-[11px] text-stone-600 leading-relaxed">
          AI-ul răspunde doar la mesaje primite, în fereastra de 24h a Meta, cu System Prompt-ul din AI Follow-Up. Nu inițiază
          conversații. Tace cât timp un om a preluat conversația ({status.settings?.human_takeover_minutes ?? 3} min). Cuvântul
          „AUDIT” primește direct linkul de programare. Comentariile publice primesc răspuns doar manual.
        </p>
      </section>
    </div>
  );
}
