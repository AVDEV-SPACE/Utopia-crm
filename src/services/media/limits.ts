/**
 * Limitele bibliotecii media /socials, comune pentru server (tokenul de upload)
 * și browser (validarea dinaintea încărcării). Imaginile ajung mereu JPEG:
 * browserul le convertește înainte de upload, fiindcă Instagram nu acceptă alt format.
 */

export type MediaKind = 'image' | 'video';

const MB = 1024 * 1024;

export const MEDIA_LIMITS: Record<MediaKind, { types: string[]; maxBytes: number }> = {
  // Instagram: maximum 8 MB pe imagine
  image: { types: ['image/jpeg'], maxBytes: 8 * MB },
  video: { types: ['video/mp4', 'video/quicktime'], maxBytes: 200 * MB },
};

/** Latura maximă a imaginii după conversie (Instagram afișează oricum la ~1440px). */
export const IMAGE_MAX_SIDE = 2048;

/** Prefixul căii din Blob: `socials/image/...` sau `socials/video/...`. */
export const UPLOAD_PREFIX = 'socials';

export function kindFromPathname(pathname: string): MediaKind | null {
  const match = pathname.match(/^socials\/(image|video)\//);
  return match ? (match[1] as MediaKind) : null;
}
