import { sql } from '@/lib/neon';
import type { SocialChannel } from './config';

/** Postările programate pe Facebook / Instagram (tabela social_posts). */

export type SocialPostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface SocialPost {
  id: string;
  org_id: string;
  platform: SocialChannel;
  status: SocialPostStatus;
  caption: string;
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

export async function listSocialPosts(orgId: string, limit = 100): Promise<SocialPost[]> {
  const rows = await sql`
    SELECT * FROM social_posts WHERE org_id = ${orgId}
    ORDER BY coalesce(scheduled_at, created_at) DESC
    LIMIT ${limit}
  `;
  return rows as unknown as SocialPost[];
}

export async function createSocialPost(input: {
  orgId: string;
  platform: SocialChannel;
  status: 'draft' | 'scheduled';
  caption: string;
  mediaUrl: string | null;
  scheduledAt: Date | null;
  createdBy: string | null;
}): Promise<SocialPost> {
  const rows = await sql`
    INSERT INTO social_posts (org_id, platform, status, caption, media_url, scheduled_at, created_by)
    VALUES (
      ${input.orgId}, ${input.platform}, ${input.status}, ${input.caption}, ${input.mediaUrl},
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
