import { getMediaByIds } from '@/services/media/repository';
import type { PostMediaItem } from './post-rules';
import { publishToPlatform } from './publish-strategies';
import {
  claimDuePosts,
  claimPost,
  failStalePublishing,
  markPostFailed,
  markPostPublished,
  releasePosts,
  type SocialPost,
} from './posts';

/**
 * Publicarea postărilor pe Facebook / Instagram. Postarea e revendicată întâi
 * (`publishing`), apoi devine `published` sau `failed` cu motivul.
 */

/** Câte postări pe rulare: publicarea IG așteaptă procesarea media (imagine ~60s, video până la ~3 min). */
const MAX_POSTS_PER_RUN = 3;

/** Timpul de rezervat pentru o postare: video-ul pe Instagram se procesează mult mai încet. */
function reserveMs(post: SocialPost): number {
  return post.platform === 'instagram' && (post.format === 'reel' || post.format === 'carousel') ? 200_000 : 70_000;
}

export interface PublishRunResult {
  published: number;
  failed: number;
  recovered: number;
  errors: string[];
}

/** Elementele media ale postării, în ordine; postările vechi au doar `media_url`. */
async function postMedia(post: SocialPost): Promise<PostMediaItem[]> {
  if (post.media_ids.length > 0) {
    const media = await getMediaByIds(post.org_id, post.media_ids);
    if (media.length !== post.media_ids.length) throw new Error('Un fișier media al postării a fost șters din bibliotecă');
    return media.map(({ id, url, kind, width, height, duration_s }) => ({ id, url, kind, width, height, duration_s }));
  }
  return post.media_url ? [{ id: null, url: post.media_url, kind: 'image', width: null, height: null, duration_s: null }] : [];
}

/** Publică o postare deja revendicată. Nu aruncă: eșecul ajunge în rând (`error`). */
export async function publishPost(post: SocialPost): Promise<{ ok: boolean; error?: string }> {
  try {
    const externalId = await publishToPlatform(post.platform, post.caption, await postMedia(post));
    await markPostPublished(post.id, externalId);
    return { ok: true };
  } catch (error) {
    const message = (error as Error).message;
    await markPostFailed(post.id, message);
    return { ok: false, error: message };
  }
}

/** Jobul programat: postările ajunse la termen, plus curățarea revendicărilor căzute. */
export async function publishDuePosts(budgetMs: number): Promise<PublishRunResult> {
  const deadline = Date.now() + budgetMs;
  const result: PublishRunResult = { published: 0, failed: 0, recovered: await failStalePublishing(), errors: [] };

  const posts = await claimDuePosts(MAX_POSTS_PER_RUN);
  for (const [index, post] of posts.entries()) {
    // Fără timp suficient, postările rămase revin la `scheduled` pentru rularea următoare
    if (Date.now() > deadline - reserveMs(post)) {
      await releasePosts(posts.slice(index).map((p) => p.id));
      result.errors.push(`timp insuficient: ${posts.length - index} postări amânate`);
      break;
    }
    const outcome = await publishPost(post);
    if (outcome.ok) result.published++;
    else {
      result.failed++;
      result.errors.push(`${post.platform} ${post.id}: ${outcome.error}`);
    }
  }
  return result;
}

/** „Publică acum” din /socials. `null` = postarea nu există sau a fost deja publicată. */
export async function publishNow(id: string, orgId: string): Promise<{ ok: boolean; error?: string } | null> {
  const post = await claimPost(id, orgId);
  return post ? publishPost(post) : null;
}
