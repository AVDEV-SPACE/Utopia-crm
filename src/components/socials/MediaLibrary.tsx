'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Film, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { MediaKind } from '@/services/media/limits';
import type { SocialMedia } from '@/services/media/repository';
import { useMediaUpload, type UploadProgress } from './use-media-upload';
import { MediaGridSkeleton } from '@/components/ui/skeleton';

type Filter = 'all' | MediaKind;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Toate' },
  { value: 'image', label: 'Imagini' },
  { value: 'video', label: 'Video' },
];

export const MEDIA_ACCEPT = 'image/*,video/mp4,video/quicktime';

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Previzualizarea unui element media (imagine sau primul cadru al video-ului). */
export function MediaThumb({ url, kind, durationS, className = '' }: { url: string; kind: MediaKind; durationS?: number | null; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-stone-950 ${className}`}>
      {kind === 'video' ? (
        <video src={`${url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      ) : (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      )}
      {kind === 'video' && (
        <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded bg-black/70 px-1 py-0.5 text-[10px] text-stone-200">
          <Film size={10} />
          {durationS ? formatDuration(durationS) : 'video'}
        </span>
      )}
    </div>
  );
}

export function UploadProgressLine({ progress }: { progress: UploadProgress }) {
  return (
    <p className="flex items-center gap-2 text-[11px] text-stone-400">
      <Loader2 size={12} className="animate-spin" />
      {progress.total > 1 ? `${progress.index + 1}/${progress.total} · ` : ''}
      {progress.name} — {Math.round(progress.percentage)}%
    </p>
  );
}

interface MediaLibraryProps {
  /** Mod de alegere (editorul de postare): click pe un element îl adaugă / scoate din postare */
  selectable?: boolean;
  selectedIds?: string[];
  onToggle?: (media: SocialMedia) => void;
  /** Se schimbă când editorul a încărcat fișiere noi, ca biblioteca să se reîncarce */
  reloadKey?: number;
}

/**
 * Biblioteca media /socials: fișierele încărcate (mai târziu și cele generate),
 * cu filtru, upload și ștergere. În editorul de postare servește și la alegerea media.
 */
export function MediaLibrary({ selectable = false, selectedIds = [], onToggle, reloadKey = 0 }: MediaLibraryProps) {
  const [media, setMedia] = useState<SocialMedia[]>([]);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { progress, uploading, uploadFiles } = useMediaUpload();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/socials/media');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca biblioteca');
      setMedia(data.media as SocialMedia[]);
      setStorageConfigured(Boolean(data.storageConfigured));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Eroare la încărcare');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const uploaded = await uploadFiles(Array.from(files));
    if (fileInput.current) fileInput.current.value = '';
    if (uploaded.length > 0) setMedia((prev) => [...uploaded.reverse(), ...prev]);
  }

  async function remove(item: SocialMedia) {
    if (!window.confirm('Ștergi fișierul din bibliotecă?')) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/socials/media/${item.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut șterge');
      setMedia((prev) => prev.filter((m) => m.id !== item.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut șterge');
    } finally {
      setBusyId(null);
    }
  }

  const visible = filter === 'all' ? media : media.filter((m) => m.kind === filter);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filter === f.value
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:text-stone-400'
            }`}
          >
            {f.label}
          </button>
        ))}
        <input ref={fileInput} type="file" multiple accept={MEDIA_ACCEPT} className="hidden" onChange={(e) => onFiles(e.target.files)} />
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={uploading || !storageConfigured}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          Încarcă
        </Button>
      </div>

      {progress && <UploadProgressLine progress={progress} />}
      {!storageConfigured && (
        <p className="text-[11px] text-amber-400/90">
          Stocarea media nu e configurată: creează un Blob store în Vercel (Storage → Blob), leagă-l de proiect și adaugă
          BLOB_READ_WRITE_TOKEN în .env.
        </p>
      )}

      {loading ? (
        <MediaGridSkeleton />
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-stone-500">Niciun fișier în bibliotecă.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {visible.map((item) => {
            const order = selectedIds.indexOf(item.id);
            return (
              <li key={item.id} className="group relative">
                <button
                  type="button"
                  disabled={!selectable}
                  onClick={() => onToggle?.(item)}
                  title={item.name ?? undefined}
                  className={`block w-full rounded-lg ${selectable ? 'cursor-pointer' : 'cursor-default'} ${
                    order >= 0 ? 'ring-2 ring-amber-500' : ''
                  }`}
                >
                  <MediaThumb url={item.url} kind={item.kind} durationS={item.duration_s} className="aspect-square" />
                </button>
                {order >= 0 && (
                  <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-semibold text-black">
                    {order + 1}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => remove(item)}
                  title="Șterge"
                  className="absolute right-1 top-1 rounded-md bg-black/70 p-1 text-red-400 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                >
                  {busyId === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
