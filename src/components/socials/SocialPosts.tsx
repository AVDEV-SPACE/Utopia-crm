'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Facebook, Instagram, Loader2, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SocialPost, SocialPostStatus } from '@/services/social/posts';

type Platform = 'facebook' | 'instagram';
type Mode = 'now' | 'schedule' | 'draft';

const STATUS_META: Record<SocialPostStatus, { label: string; className: string }> = {
  draft: { label: 'Ciornă', className: 'text-stone-400 border-stone-700/60' },
  scheduled: { label: 'Programată', className: 'text-sky-400 border-sky-500/30' },
  publishing: { label: 'Se publică', className: 'text-amber-400 border-amber-500/30' },
  published: { label: 'Publicată', className: 'text-emerald-400 border-emerald-500/30' },
  failed: { label: 'Eșuată', className: 'text-red-400 border-red-500/30' },
};

const dateFormatter = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Valoarea implicită pentru programare: peste o oră, în ora locală (formatul input-ului datetime-local). */
function inOneHour(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/**
 * Postările /socials: compunere (Facebook sau Instagram, text + imagine prin
 * URL public), publicare imediată, programare sau ciornă, și lista cu statusul
 * fiecăreia. Programările le publică jobul /api/cron/social-publish.
 */
export function SocialPosts() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [platform, setPlatform] = useState<Platform>('facebook');
  const [caption, setCaption] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mode, setMode] = useState<Mode>('schedule');
  const [scheduledAt, setScheduledAt] = useState(inOneHour);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/socials/posts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca postările');
      setPosts(data as SocialPost[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/socials/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          caption,
          mediaUrl: mediaUrl.trim() || null,
          mode,
          scheduledAt: mode === 'schedule' ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva postarea');
      if (mode === 'now') {
        if (data.published) toast.success('Postare publicată');
        else toast.error(`Publicarea a eșuat: ${data.error ?? 'eroare'}`);
      } else {
        toast.success(mode === 'draft' ? 'Ciornă salvată' : 'Postare programată');
      }
      setCaption('');
      setMediaUrl('');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva postarea');
    } finally {
      setSaving(false);
    }
  }

  async function publish(post: SocialPost) {
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/socials/posts/${post.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut publica');
      if (data.published) toast.success('Postare publicată');
      else toast.error(`Publicarea a eșuat: ${data.error ?? 'eroare'}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut publica');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(post: SocialPost) {
    if (!window.confirm('Ștergi postarea?')) return;
    setBusyId(post.id);
    try {
      const res = await fetch(`/api/socials/posts/${post.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut șterge');
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut șterge');
    } finally {
      setBusyId(null);
    }
  }

  const needsImage = platform === 'instagram' && !mediaUrl.trim();

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-stone-800/60 bg-stone-900/60 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['facebook', 'instagram'] as const).map((value) => {
            const Icon = value === 'facebook' ? Facebook : Instagram;
            return (
              <button
                key={value}
                onClick={() => setPlatform(value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  platform === value
                    ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                    : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:text-stone-400'
                }`}
              >
                <Icon size={12} /> {value === 'facebook' ? 'Facebook' : 'Instagram'}
              </button>
            );
          })}
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={2200}
          placeholder="Textul postării..."
          className="w-full rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40"
        />
        <input
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder={platform === 'instagram' ? 'URL public al imaginii (obligatoriu pe Instagram, JPEG)' : 'URL public al imaginii (opțional)'}
          className="w-full rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40"
        />

        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-400">
          {(['schedule', 'now', 'draft'] as const).map((value) => (
            <label key={value} className="flex items-center gap-1.5">
              <input type="radio" checked={mode === value} onChange={() => setMode(value)} className="accent-amber-500" />
              {value === 'schedule' ? 'Programează' : value === 'now' ? 'Publică acum' : 'Ciornă'}
            </label>
          ))}
          {mode === 'schedule' && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="rounded-lg border border-stone-800 bg-stone-950/60 px-2 py-1 text-xs text-stone-200"
            />
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={saving || needsImage || (!caption.trim() && !mediaUrl.trim())}
            className="ml-auto bg-amber-500 text-black hover:bg-amber-400"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Send />}
            {mode === 'now' ? 'Publică' : mode === 'schedule' ? 'Programează' : 'Salvează ciorna'}
          </Button>
        </div>
        {needsImage && <p className="text-[11px] text-amber-400/90">Instagram nu acceptă postări fără imagine.</p>}
      </section>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-stone-500">
          <Loader2 size={14} className="mr-2 animate-spin" /> Se încarcă...
        </div>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-stone-500">Nicio postare încă.</p>
      ) : (
        <ul className="space-y-2">
          {posts.map((post) => {
            const status = STATUS_META[post.status];
            const Icon = post.platform === 'instagram' ? Instagram : Facebook;
            const when = post.published_at ?? post.scheduled_at ?? post.created_at;
            const editable = post.status === 'draft' || post.status === 'scheduled' || post.status === 'failed';
            return (
              <li key={post.id} className="rounded-xl border border-stone-800/60 bg-stone-900/60 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Icon size={13} className="text-stone-400" />
                  <span className={`rounded-md border px-2 py-0.5 ${status.className}`}>{status.label}</span>
                  <span className="text-stone-500">{dateFormatter.format(new Date(when))}</span>
                  {editable && (
                    <span className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="outline" disabled={busyId === post.id} onClick={() => publish(post)}>
                        {busyId === post.id ? <Loader2 className="animate-spin" /> : <Send />}
                        Publică acum
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === post.id} onClick={() => remove(post)} className="text-red-400 hover:text-red-300">
                        <Trash2 />
                      </Button>
                    </span>
                  )}
                </div>
                {post.caption && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-300 line-clamp-4">{post.caption}</p>}
                {post.media_url && <p className="mt-1 truncate text-[11px] text-stone-600">{post.media_url}</p>}
                {post.error && <p className="mt-1 text-[11px] text-red-400">{post.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
