import { sql } from '@/lib/neon';
import type { SocialPlatform } from './config';
import type { PostFormat, PostMediaItem } from './post-rules';

/** Postările programate pe Facebook / Instagram (tabela social_posts). */

export type SocialPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  org_id: string;
  platform: SocialPlatform;
  status: SocialPostStatus;
  caption: string;
  format: PostFormat;
  /** Elementele din biblioteca media, în ordinea de afișare */
  media_ids: string[];
  /** Postările vechi: imaginea dată direct prin URL */
  media_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** După cât timp o postare rămasă „publishing” (rulare căzută) e considerată eșuată. */
const STALE_PUBLISHING_MINUTES = 15;

/** Postarea cu elementele media rezolvate (pentru listă și publicare). */
export interface SocialPostWithMedia extends SocialPost {
  media: PostMediaItem[];
}

export async function listSocialPosts(orgId: string, limit = 100): Promise<SocialPostWithMedia[]> {
  const rows = await sql`
    SELECT p.*, coalesce((
      SELECT json_agg(
        json_build_object('id', m.id, 'url', m.url, 'kind', m.kind, 'width', m.width, 'height', m.height, 'duration_s', m.duration_s)
        ORDER BY array_position(p.media_ids, m.id)
      )
      FROM social_media m WHERE m.id = ANY(p.media_ids)
    ), '[]'::json) AS media
    FROM social_posts p WHERE p.org_id = ${orgId}
    ORDER BY coalesce(p.scheduled_at, p.created_at) DESC
    LIMIT ${limit}
  `;
  return (rows as unknown as SocialPostWithMedia[]).map(withLegacyMedia);
}

/** Postările vechi au imaginea în media_url, nu în biblioteca media. */
function withLegacyMedia(post: SocialPostWithMedia): SocialPostWithMedia {
  if (post.media.length > 0 || !post.media_url) return post;
  return { ...post, media: [{ id: null, url: post.media_url, kind: 'image', width: null, height: null, duration_s: null }] };
}

export async function createSocialPost(input: {
  orgId: string;
  platform: SocialPlatform;
  status: 'draft' | 'scheduled';
  caption: string;
  format: PostFormat;
  mediaIds: string[];
  scheduledAt: Date | null;
  createdBy: string | null;
}): Promise<SocialPost> {
  const rows = await sql`
    INSERT INTO social_posts (org_id, platform, status, caption, format, media_ids, scheduled_at, created_by)
    VALUES (
      ${input.orgId}, ${input.platform}, ${input.status}, ${input.caption}, ${input.format}, ${input.mediaIds}::uuid[],
      ${input.scheduledAt ? input.scheduledAt.toISOString() : null}::timestamptz, ${input.createdBy}
    )
    RETURNING *
  `;
  return rows[0] as unknown as SocialPost;
}

/** Ștergere permisă doar înainte de publicare (ciornă, programată, eșuată). */
export async function deleteSocialPost(id: string, orgId: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM social_posts
    WHERE id = ${id}::uuid AND org_id = ${orgId} AND status IN ('draft', 'scheduled', 'failed')
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Revendică postările programate ajunse la termen: un singur UPDATE ... RETURNING
 * (`scheduled` → `publishing`) cu SKIP LOCKED, deci două rulări suprapuse nu
 * publică aceeași postare de două ori.
 */
export async function claimDuePosts(limit: number): Promise<SocialPost[]> {
  const rows = await sql`
    UPDATE social_posts SET status = 'publishing', updated_at = now()
    WHERE id IN (
      SELECT id FROM social_posts
      WHERE status = 'scheduled' AND scheduled_at <= now()
      ORDER BY scheduled_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;
  return rows as unknown as SocialPost[];
}

/** „Publică acum” din UI: revendică o postare nepublicată, indiferent de dată. */
export async function claimPost(id: string, orgId: string): Promise<SocialPost | null> {
  const rows = await sql`
    UPDATE social_posts SET status = 'publishing', updated_at = now()
    WHERE id = ${id}::uuid AND org_id = ${orgId} AND status IN ('draft', 'scheduled', 'failed')
    RETURNING *
  `;
  return (rows[0] as unknown as SocialPost) ?? null;
}

/** Revendicări nefolosite (timp insuficient în rulare) revin la `scheduled`. */
export async function releasePosts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    UPDATE social_posts SET status = 'scheduled', updated_at = now()
    WHERE id = ANY(${ids}::uuid[]) AND status = 'publishing'
  `;
}

export async function markPostPublished(id: string, externalPostId: string): Promise<void> {
  await sql`
    UPDATE social_posts SET status = 'published', external_post_id = ${externalPostId},
      published_at = now(), error = NULL, updated_at = now()
    WHERE id = ${id}::uuid
  `;
}

export async function markPostFailed(id: string, error: string): Promise<void> {
  await sql`
    UPDATE social_posts SET status = 'failed', error = ${error.slice(0, 1000)}, updated_at = now()
    WHERE id = ${id}::uuid
  `;
}

/** Postările rămase în `publishing` după o rulare căzută devin eșuate (se pot republica din UI). */
export async function failStalePublishing(): Promise<number> {
  const rows = await sql`
    UPDATE social_posts
    SET status = 'failed', error = 'Publicarea a fost întreruptă — verifică pe platformă și republică', updated_at = now()
    WHERE status = 'publishing' AND updated_at < now() - make_interval(mins => ${STALE_PUBLISHING_MINUTES})
    RETURNING id
  `;
  return rows.length;
}
