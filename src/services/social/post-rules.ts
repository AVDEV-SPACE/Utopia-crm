import type { MediaKind } from '@/services/media/limits';
import type { SocialChannel } from './config';

/**
 * Regulile unei postări, fără dependențe de server: le folosesc și API-ul
 * (validarea la salvare, publicarea) și editorul din /socials (avertismente live).
 */

export type PostFormat = 'text' | 'single' | 'carousel' | 'reel';

export interface PostMediaItem {
  /** null pentru postările vechi cu imagine dată prin URL */
  id: string | null;
  url: string;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  duration_s: number | null;
}

/** Maximum de elemente într-un carusel (Instagram și Facebook). */
export const MAX_POST_MEDIA = 10;

export const FORMAT_LABELS: Record<PostFormat, string> = {
  text: 'Text',
  single: 'Imagine',
  carousel: 'Carusel',
  reel: 'Video / reel',
};

export function postFormat(media: Pick<PostMediaItem, 'kind'>[]): PostFormat {
  if (media.length === 0) return 'text';
  if (media.length > 1) return 'carousel';
  return media[0].kind === 'video' ? 'reel' : 'single';
}

// Instagram: imagini între 4:5 (portret) și 1.91:1 (peisaj); reels 3s–15 min; video în carusel ≤ 60s
const IG_MIN_RATIO = 0.8;
const IG_MAX_RATIO = 1.91;
const IG_REEL_SECONDS = { min: 3, max: 900 };
const IG_CAROUSEL_VIDEO_MAX_SECONDS = 60;

/** Motivul pentru care platforma ar respinge postarea, sau null dacă e publicabilă. */
export function postProblem(platform: SocialChannel, media: PostMediaItem[]): string | null {
  const format = postFormat(media);
  if (media.length > MAX_POST_MEDIA) return `Maximum ${MAX_POST_MEDIA} elemente într-un carusel`;

  if (platform === 'facebook') {
    if (format === 'carousel' && media.some((m) => m.kind === 'video')) {
      return 'Facebook nu acceptă video în postări cu mai multe elemente — publică video-ul separat';
    }
    return null;
  }

  if (format === 'text') return 'Instagram cere cel puțin o imagine sau un video';
  for (const item of media) {
    if (item.kind === 'image' && item.width && item.height) {
      const ratio = item.width / item.height;
      if (ratio < IG_MIN_RATIO || ratio > IG_MAX_RATIO) {
        return `Instagram acceptă imagini între 4:5 (portret) și 1.91:1 (peisaj); una are ${item.width}×${item.height}`;
      }
    }
    if (item.kind === 'video' && item.duration_s) {
      if (format === 'reel' && (item.duration_s < IG_REEL_SECONDS.min || item.duration_s > IG_REEL_SECONDS.max)) {
        return 'Instagram acceptă reels între 3 secunde și 15 minute';
      }
      if (format === 'carousel' && item.duration_s > IG_CAROUSEL_VIDEO_MAX_SECONDS) {
        return 'Instagram acceptă în carusel doar video de maximum 60 de secunde';
      }
    }
  }
  return null;
}
