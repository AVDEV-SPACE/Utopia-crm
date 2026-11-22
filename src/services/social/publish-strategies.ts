import type { SocialPlatform } from './config';
import {
  publishFacebookAlbum,
  publishFacebookPost,
  publishFacebookVideo,
  publishInstagramCarousel,
  publishInstagramPost,
  publishInstagramReel,
} from './graph';
import { publishLinkedInPost } from './linkedin/publish';
import { postFormat, postProblem, type PostFormat, type PostMediaItem } from './post-rules';

/**
 * Publicarea pe formate (Strategy): fiecare combinație platformă × format are
 * funcția ei. Un format nou înseamnă o intrare nouă aici, nu încă un `if` în publish.ts.
 * Întoarce id-ul extern al postării.
 */
type Publisher = (caption: string, media: PostMediaItem[]) => Promise<string>;

const STRATEGIES: Record<SocialPlatform, Partial<Record<PostFormat, Publisher>>> = {
  facebook: {
    text: (caption) => publishFacebookPost(caption),
    single: (caption, [image]) => publishFacebookPost(caption, image.url),
    carousel: (caption, media) => publishFacebookAlbum(caption, media.map((m) => m.url)),
    reel: (caption, [video]) => publishFacebookVideo(caption, video.url),
  },
  instagram: {
    single: (caption, [image]) => publishInstagramPost(caption, image.url),
    carousel: (caption, media) => publishInstagramCarousel(caption, media),
    reel: (caption, [video]) => publishInstagramReel(caption, video.url),
  },
  linkedin: {
    text: (caption) => publishLinkedInPost(caption, []),
    single: (caption, media) => publishLinkedInPost(caption, media),
    carousel: (caption, media) => publishLinkedInPost(caption, media),
  },
};

export function publishToPlatform(platform: SocialPlatform, caption: string, media: PostMediaItem[]): Promise<string> {
  const problem = postProblem(platform, media);
  if (problem) throw new Error(problem);
  const publisher = STRATEGIES[platform][postFormat(media)];
  if (!publisher) throw new Error(`Formatul ${postFormat(media)} nu e suportat pe ${platform}`);
  return publisher(caption, media);
}
