import { sql } from '@/lib/neon';

/**
 * Fereastră de rate-limit persistată în DB (nu în memorie — instanțele
 * serverless nu împart stare). UPSERT-ul e atomic: doar un request per
 * fereastră poate câștiga condiția din WHERE.
 */
export async function tryAcquireRateLimit(key: string, windowMs: number): Promise<boolean> {
  const rows = await sql`
    INSERT INTO rate_limits (key, last_request_at)
    VALUES (${key}, now())
    ON CONFLICT (key) DO UPDATE
      SET last_request_at = now()
      WHERE rate_limits.last_request_at <= now() - (${windowMs}::text || ' milliseconds')::interval
    RETURNING key
  `;
  return rows.length > 0;
}
