import { sql } from '@/lib/neon';
import type { MediaKind } from './limits';

/** Biblioteca media din /socials (tabela social_media). */

export type MediaOrigin = 'upload' | 'template' | 'ai';

export interface SocialMedia {
  id: string;
  org_id: string;
  kind: MediaKind;
  origin: MediaOrigin;
  url: string;
  pathname: string | null;
  name: string | null;
  mime: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  created_by: string | null;
  created_at: string;
}

export async function listMedia(orgId: string, limit = 200): Promise<SocialMedia[]> {
  const rows = await sql`
    SELECT * FROM social_media WHERE org_id = ${orgId}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows as unknown as SocialMedia[];
}

/** Elementele cerute, în ordinea id-urilor primite; cele inexistente lipsesc din rezultat. */
export async function getMediaByIds(orgId: string, ids: string[]): Promise<SocialMedia[]> {
  if (ids.length === 0) return [];
  const rows = (await sql`
    SELECT * FROM social_media WHERE org_id = ${orgId} AND id = ANY(${ids}::uuid[])
  `) as unknown as SocialMedia[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is SocialMedia => Boolean(row));
}

export async function createMedia(input: {
  orgId: string;
  kind: MediaKind;
  origin: MediaOrigin;
  url: string;
  pathname: string | null;
  name: string | null;
  mime: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  createdBy: string | null;
}): Promise<SocialMedia> {
  const rows = await sql`
    INSERT INTO social_media (org_id, kind, origin, url, pathname, name, mime, size_bytes, width, height, duration_s, created_by)
    VALUES (
      ${input.orgId}, ${input.kind}, ${input.origin}, ${input.url}, ${input.pathname}, ${input.name}, ${input.mime},
      ${input.sizeBytes}, ${input.width}, ${input.height}, ${input.durationS}, ${input.createdBy}
    )
    RETURNING *
  `;
  return rows[0] as unknown as SocialMedia;
}

/** Folosit de o postare care încă nu a plecat (ciornă, programată, în publicare, eșuată). */
export async function isMediaInUse(id: string, orgId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM social_posts
    WHERE org_id = ${orgId} AND status <> 'published' AND ${id}::uuid = ANY(media_ids)
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function getMedia(id: string, orgId: string): Promise<SocialMedia | null> {
  const rows = await sql`SELECT * FROM social_media WHERE id = ${id}::uuid AND org_id = ${orgId}`;
  return (rows[0] as unknown as SocialMedia) ?? null;
}

export async function deleteMediaRow(id: string, orgId: string): Promise<void> {
  await sql`DELETE FROM social_media WHERE id = ${id}::uuid AND org_id = ${orgId}`;
}
