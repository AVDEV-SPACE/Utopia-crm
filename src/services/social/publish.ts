import { publishFacebookPost, publishInstagramPost } from './graph';
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

/** Câte postări pe rulare: publicarea IG așteaptă procesarea imaginii (până la ~60s). */
const MAX_POSTS_PER_RUN = 3;

export interface PublishRunResult {
  published: number;
  failed: number;
  recovered: number;
  errors: string[];
}

/** Publică o postare deja revendicată. Nu aruncă: eșecul ajunge în rând (`error`). */
export async function publishPost(post: SocialPost): Promise<{ ok: boolean; error?: string }> {
  try {
    let externalId: string;
    if (post.platform === 'instagram') {
      if (!post.media_url) throw new Error('Instagram cere o imagine (URL public)');
      externalId = await publishInstagramPost(post.caption, post.media_url);
    } else {
      externalId = await publishFacebookPost(post.caption, post.media_url);
    }
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
    if (Date.now() > deadline - 70_000) {
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
