'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { toast } from 'sonner';
import { IMAGE_MAX_SIDE, MEDIA_LIMITS, UPLOAD_PREFIX, type MediaKind } from '@/services/media/limits';
import type { SocialMedia } from '@/services/media/repository';

const MULTIPART_FROM_BYTES = 20 * 1024 * 1024;

/** Nume de fișier sigur pentru calea din store (fără diacritice și spații). */
function safeName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'media';
}

/**
 * Orice imagine (PNG, WebP, JPEG mare) devine JPEG de maximum 2048px și 8 MB:
 * Instagram acceptă doar JPEG. Orientarea EXIF se aplică la decodare.
 */
async function toJpeg(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(`${file.name}: browserul nu poate citi această imagine`);
  });
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Conversia imaginii nu e disponibilă în acest browser');
  // Fundal alb pentru PNG-urile transparente (JPEG nu are transparență)
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MEDIA_LIMITS.image.maxBytes) return { blob, width, height };
  }
  throw new Error(`${file.name}: imaginea depășește 8 MB și după comprimare`);
}

function videoMeta(file: File): Promise<{ width: number | null; height: number | null; durationS: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (meta: { width: number | null; height: number | null; durationS: number | null }) => {
      URL.revokeObjectURL(url);
      resolve(meta);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationS: Number.isFinite(video.duration) ? Math.round(video.duration * 100) / 100 : null,
      });
    video.onerror = () => done({ width: null, height: null, durationS: null });
    video.src = url;
  });
}

/** Încarcă un fișier direct în store, apoi îl înregistrează în biblioteca media. */
async function uploadMediaFile(file: File, onProgress: (percentage: number) => void): Promise<SocialMedia> {
  const kind: MediaKind | null = file.type.startsWith('image/')
    ? 'image'
    : MEDIA_LIMITS.video.types.includes(file.type)
      ? 'video'
      : null;
  if (!kind) throw new Error(`${file.name}: acceptăm imagini și video MP4 / MOV`);

  let body: Blob = file;
  let contentType = file.type;
  let meta: { width: number | null; height: number | null; durationS: number | null };
  let extension: string;
  if (kind === 'image') {
    const jpeg = await toJpeg(file);
    body = jpeg.blob;
    contentType = 'image/jpeg';
    meta = { width: jpeg.width, height: jpeg.height, durationS: null };
    extension = 'jpg';
  } else {
    if (file.size > MEDIA_LIMITS.video.maxBytes) throw new Error(`${file.name}: video-ul depășește 200 MB`);
    meta = await videoMeta(file);
    extension = file.type === 'video/quicktime' ? 'mov' : 'mp4';
  }

  const blob = await upload(`${UPLOAD_PREFIX}/${kind}/${safeName(file.name)}.${extension}`, body, {
    access: 'public',
    handleUploadUrl: '/api/socials/media/upload',
    contentType,
    multipart: body.size > MULTIPART_FROM_BYTES,
    onUploadProgress: ({ percentage }) => onProgress(percentage),
  });

  const res = await fetch('/api/socials/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: blob.url,
      pathname: blob.pathname,
      kind,
      mime: contentType,
      sizeBytes: body.size,
      ...meta,
      name: file.name.slice(0, 200),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva fișierul în bibliotecă');
  return data.media as SocialMedia;
}

export interface UploadProgress {
  name: string;
  index: number;
  total: number;
  percentage: number;
}

/**
 * Upload-ul din /socials (bibliotecă și editorul de postare): fișierele pe rând,
 * cu progres; cele eșuate apar ca toast, celelalte se întorc în ordine.
 */
export function useMediaUpload() {
  const [progress, setProgress] = useState<UploadProgress | null>(null);

  async function uploadFiles(files: File[]): Promise<SocialMedia[]> {
    const uploaded: SocialMedia[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setProgress({ name: file.name, index, total: files.length, percentage: 0 });
        try {
          uploaded.push(
            await uploadMediaFile(file, (percentage) => setProgress({ name: file.name, index, total: files.length, percentage }))
          );
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `${file.name}: upload eșuat`);
        }
      }
    } finally {
      setProgress(null);
    }
    if (uploaded.length > 0) toast.success(uploaded.length === 1 ? 'Fișier încărcat' : `${uploaded.length} fișiere încărcate`);
    return uploaded;
  }

  return { progress, uploading: progress !== null, uploadFiles };
}
