'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Clapperboard, Facebook, Images, Instagram, Loader2, Send, Sparkles, Trash2, Upload, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SocialMedia } from '@/services/media/repository';
import { FORMAT_LABELS, MAX_POST_MEDIA, postFormat, postProblem, type PostMediaItem } from '@/services/social/post-rules';
import type { SocialPostStatus, SocialPostWithMedia } from '@/services/social/posts';
import { useLiveRefresh } from '@/hooks/use-live-refresh';
import { MEDIA_ACCEPT, MediaLibrary, MediaThumb, UploadProgressLine } from './MediaLibrary';
import { useMediaUpload } from './use-media-upload';
import { ListSkeleton } from '@/components/ui/skeleton';

/** Jobul programat schimbă statusul postărilor (Programată → Publicată/Eșuată). */
const REFRESH_MS = 30_000;

type Platform = 'facebook' | 'instagram';
type Mode = 'now' | 'schedule' | 'draft';

const PLATFORMS: { value: Platform; label: string; icon: typeof Facebook }[] = [
  { value: 'facebook', label: 'Facebook', icon: Facebook },
  { value: 'instagram', label: 'Instagram', icon: Instagram },
];

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

const asPostMedia = ({ id, url, kind, width, height, duration_s }: SocialMedia): PostMediaItem => ({ id, url, kind, width, height, duration_s });

/** Butoanele de generare se activează odată cu fazele lor (F3 text, F4 imagini, F5 reels). */
function ComingSoonButton({ icon: Icon, label, phase }: { icon: typeof Sparkles; label: string; phase: string }) {
  return (
    <Button size="sm" variant="outline" disabled title={`Disponibil în faza ${phase}`}>
      <Icon />
      {label}
      <span className="text-[10px] text-stone-500">în curând</span>
    </Button>
  );
}

/**
 * Postările /socials: compunere (Facebook și/sau Instagram; text, imagine,
 * carusel sau video din biblioteca media), publicare imediată, programare sau
 * ciornă, și lista cu statusul fiecăreia. Programările le publică jobul /api/cron/social-publish.
 */
export function SocialPosts() {
  const [posts, setPosts] = useState<SocialPostWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [platforms, setPlatforms] = useState<Platform[]>(['facebook', 'instagram']);
  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<SocialMedia[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);
  const [mode, setMode] = useState<Mode>('schedule');
  const [scheduledAt, setScheduledAt] = useState(inOneHour);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { progress, uploading, uploadFiles } = useMediaUpload();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/socials/posts');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca postările');
      setPosts(data as SocialPostWithMedia[]);
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

  useLiveRefresh(load, REFRESH_MS);

  function togglePlatform(value: Platform) {
    setPlatforms((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  function toggleMedia(item: SocialMedia) {
    setMedia((prev) => {
      if (prev.some((m) => m.id === item.id)) return prev.filter((m) => m.id !== item.id);
      if (prev.length >= MAX_POST_MEDIA) {
        toast.error(`Maximum ${MAX_POST_MEDIA} elemente într-o postare`);
        return prev;
      }
      return [...prev, item];
    });
  }

  function moveMedia(index: number, delta: -1 | 1) {
    setMedia((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const uploaded = await uploadFiles(Array.from(files));
    if (fileInput.current) fileInput.current.value = '';
    if (uploaded.length === 0) return;
    setMedia((prev) => [...prev, ...uploaded].slice(0, MAX_POST_MEDIA));
    setLibraryKey((k) => k + 1);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/socials/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms,
          caption,
          mediaIds: media.map((m) => m.id),
          mode,
          scheduledAt: mode === 'schedule' ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva postarea');
      if (mode === 'now') {
        for (const result of data.results as { platform: Platform; published: boolean; error: string | null }[]) {
          const label = result.platform === 'facebook' ? 'Facebook' : 'Instagram';
          if (result.published) toast.success(`${label}: postare publicată`);
          else toast.error(`${label}: publicarea a eșuat — ${result.error ?? 'eroare'}`);
        }
      } else {
        toast.success(mode === 'draft' ? 'Ciornă salvată' : 'Postare programată');
      }
      setCaption('');
      setMedia([]);
      setLibraryOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva postarea');
    } finally {
      setSaving(false);
    }
  }

  async function publish(post: SocialPostWithMedia) {
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

  async function remove(post: SocialPostWithMedia) {
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

  const postMedia = media.map(asPostMedia);
  const format = postFormat(postMedia);
  const problems = platforms
    .map((p) => {
      const problem = postProblem(p, postMedia);
      return problem ? `${p === 'facebook' ? 'Facebook' : 'Instagram'}: ${problem}` : null;
    })
    .filter((p): p is string => Boolean(p));
  const empty = !caption.trim() && media.length === 0;

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-stone-800/60 bg-stone-900/60 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {PLATFORMS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => togglePlatform(value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                platforms.includes(value)
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:text-stone-400'
              }`}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
          <span className="ml-auto text-[11px] text-stone-500">Format: {FORMAT_LABELS[format]}</span>
        </div>

        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={2200}
          placeholder="Textul postării..."
          className="w-full rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40"
        />
        <div className="flex items-center gap-2">
          <ComingSoonButton icon={Sparkles} label="Generează text" phase="F3" />
          <span className="ml-auto text-[11px] text-stone-600">{caption.length}/2200</span>
        </div>

        {media.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {media.map((item, index) => (
              <li key={item.id} className="relative w-24">
                <MediaThumb url={item.url} kind={item.kind} durationS={item.duration_s} className="aspect-square" />
                <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold text-black">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => toggleMedia(item)}
                  title="Scoate din postare"
                  className="absolute right-1 top-1 rounded-md bg-black/70 p-0.5 text-stone-200 hover:text-white"
                >
                  <X size={12} />
                </button>
                {media.length > 1 && (
                  <div className="mt-1 flex justify-between">
                    <button type="button" disabled={index === 0} onClick={() => moveMedia(index, -1)} className="text-stone-500 hover:text-stone-300 disabled:opacity-30">
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      disabled={index === media.length - 1}
                      onClick={() => moveMedia(index, 1)}
                      className="text-stone-500 hover:text-stone-300 disabled:opacity-30"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInput} type="file" multiple accept={MEDIA_ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            Încarcă
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLibraryOpen((open) => !open)}>
            <Images />
            {libraryOpen ? 'Ascunde biblioteca' : 'Din bibliotecă'}
          </Button>
          <ComingSoonButton icon={Wand2} label="Generează imagine" phase="F4" />
          <ComingSoonButton icon={Clapperboard} label="Generează reel" phase="F5" />
        </div>
        {progress && <UploadProgressLine progress={progress} />}

        {libraryOpen && (
          <div className="rounded-lg border border-stone-800/60 bg-stone-950/40 p-3">
            <MediaLibrary selectable selectedIds={media.map((m) => m.id)} onToggle={toggleMedia} reloadKey={libraryKey} />
          </div>
        )}

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
            disabled={saving || uploading || platforms.length === 0 || empty || problems.length > 0}
            className="ml-auto bg-amber-500 text-black hover:bg-amber-400"
          >
            {saving ? <Loader2 className="animate-spin" /> : <Send />}
            {mode === 'now' ? 'Publică' : mode === 'schedule' ? 'Programează' : 'Salvează ciorna'}
          </Button>
        </div>
        {platforms.length === 0 && <p className="text-[11px] text-amber-400/90">Alege cel puțin o platformă.</p>}
        {problems.map((problem) => (
          <p key={problem} className="text-[11px] text-amber-400/90">
            {problem}
          </p>
        ))}
      </section>

      {loading ? (
        <ListSkeleton rows={4} />
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
                  <span className="text-stone-500">{FORMAT_LABELS[post.format] ?? post.format}</span>
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
                {post.media.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {post.media.slice(0, 5).map((item, index) => (
                      <MediaThumb key={item.id ?? index} url={item.url} kind={item.kind} durationS={item.duration_s} className="h-14 w-14" />
                    ))}
                    {post.media.length > 5 && <span className="self-center text-[11px] text-stone-500">+{post.media.length - 5}</span>}
                  </div>
                )}
                {post.caption && <p className="mt-2 whitespace-pre-wrap text-sm text-stone-300 line-clamp-4">{post.caption}</p>}
                {post.error && <p className="mt-1 text-[11px] text-red-400">{post.error}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
