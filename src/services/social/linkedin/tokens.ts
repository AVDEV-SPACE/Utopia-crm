import { sql } from '@/lib/neon';
import { LinkedInError } from './api';
import { decryptSecret, encryptSecret } from './crypto';
import { refreshAccessToken, type TokenSet } from './oauth';

/**
 * Conexiunea LinkedIn salvată (tabela social_credentials, setup-db-linkedin.sql).
 * Tokenii sunt criptați în DB și decriptați doar în memorie, la apel.
 */

/** Cu cât timp înainte de expirare se reîmprospătează tokenul (dacă există refresh token). */
const REFRESH_MARGIN_MS = 7 * 24 * 3600_000;

export interface LinkedInConnection {
  org_id: string;
  organization_urn: string;
  member_urn: string | null;
  member_name: string | null;
  scopes: string;
  access_expires_at: string;
  refresh_expires_at: string | null;
  has_refresh_token: boolean;
  connected_by: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
}

interface CredentialRow extends LinkedInConnection {
  access_token_enc: string;
  refresh_token_enc: string | null;
}

/** Eroare de autorizare: tokenul a expirat sau a fost revocat — adminul trebuie să reconecteze pagina. */
export class LinkedInAuthError extends LinkedInError {
  constructor(message: string) {
    super(message, 401, 'REAUTH_REQUIRED');
    this.name = 'LinkedInAuthError';
  }
}

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

export async function saveConnection(input: {
  orgId: string;
  organizationUrn: string;
  tokens: TokenSet;
  memberUrn: string | null;
  memberName: string | null;
  connectedBy: string;
}): Promise<void> {
  const { tokens } = input;
  await sql`
    INSERT INTO social_credentials (
      org_id, provider, access_token_enc, access_expires_at, refresh_token_enc, refresh_expires_at,
      scopes, member_urn, member_name, organization_urn, connected_by, last_error, updated_at
    ) VALUES (
      ${input.orgId}, 'linkedin', ${encryptSecret(tokens.accessToken)}, ${inSeconds(tokens.expiresIn)}::timestamptz,
      ${tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null},
      ${tokens.refreshExpiresIn ? inSeconds(tokens.refreshExpiresIn) : null}::timestamptz,
      ${tokens.scope}, ${input.memberUrn}, ${input.memberName}, ${input.organizationUrn}, ${input.connectedBy}, NULL, now()
    )
    ON CONFLICT (org_id, provider) DO UPDATE SET
      access_token_enc   = EXCLUDED.access_token_enc,
      access_expires_at  = EXCLUDED.access_expires_at,
      refresh_token_enc  = EXCLUDED.refresh_token_enc,
      refresh_expires_at = EXCLUDED.refresh_expires_at,
      scopes             = EXCLUDED.scopes,
      member_urn         = EXCLUDED.member_urn,
      member_name        = EXCLUDED.member_name,
      organization_urn   = EXCLUDED.organization_urn,
      connected_by       = EXCLUDED.connected_by,
      last_error         = NULL,
      updated_at         = now()
  `;
}

async function getRow(orgId: string): Promise<CredentialRow | null> {
  const rows = await sql`
    SELECT *, (refresh_token_enc IS NOT NULL) AS has_refresh_token
    FROM social_credentials WHERE org_id = ${orgId} AND provider = 'linkedin'
  `;
  return (rows[0] as unknown as CredentialRow) ?? null;
}

/** Conexiunea fără tokeni — sigură pentru UI. */
export async function getConnection(orgId: string): Promise<LinkedInConnection | null> {
  const row = await getRow(orgId);
  if (!row) return null;
  const { access_token_enc: _a, refresh_token_enc: _r, ...safe } = row;
  return safe;
}

export async function deleteConnection(orgId: string): Promise<void> {
  await sql`DELETE FROM social_credentials WHERE org_id = ${orgId} AND provider = 'linkedin'`;
}

export async function recordSyncResult(orgId: string, error: string | null): Promise<void> {
  await sql`
    UPDATE social_credentials
    SET last_sync_at = CASE WHEN ${error}::text IS NULL THEN now() ELSE last_sync_at END,
        last_error = ${error}, updated_at = now()
    WHERE org_id = ${orgId} AND provider = 'linkedin'
  `;
}

/**
 * Tokenul de acces valid al paginii, reîmprospătat automat când se apropie
 * expirarea (dacă aplicația are refresh token). Fără conexiune validă aruncă
 * LinkedInAuthError — UI-ul cere atunci reconectarea.
 */
export async function getAccessToken(orgId: string): Promise<{ token: string; organizationUrn: string }> {
  const row = await getRow(orgId);
  if (!row) throw new LinkedInAuthError('LinkedIn nu este conectat — conectează pagina din /socials → LinkedIn');

  const expiresAt = new Date(row.access_expires_at).getTime();
  const needsRefresh = expiresAt - Date.now() < REFRESH_MARGIN_MS;

  if (needsRefresh && row.refresh_token_enc) {
    const refreshValid = !row.refresh_expires_at || new Date(row.refresh_expires_at).getTime() > Date.now();
    if (refreshValid) {
      try {
        const tokens = await refreshAccessToken(decryptSecret(row.refresh_token_enc));
        await sql`
          UPDATE social_credentials SET
            access_token_enc  = ${encryptSecret(tokens.accessToken)},
            access_expires_at = ${inSeconds(tokens.expiresIn)}::timestamptz,
            refresh_token_enc = ${tokens.refreshToken ? encryptSecret(tokens.refreshToken) : row.refresh_token_enc},
            last_error = NULL, updated_at = now()
          WHERE org_id = ${orgId} AND provider = 'linkedin'
        `;
        return { token: tokens.accessToken, organizationUrn: row.organization_urn };
      } catch (error) {
        // Refresh eșuat: tokenul curent se mai folosește cât e valid
        console.warn('[linkedin] reîmprospătarea tokenului a eșuat:', (error as Error).message);
      }
    }
  }

  if (expiresAt <= Date.now()) {
    await recordSyncResult(orgId, 'Tokenul LinkedIn a expirat — reconectează pagina');
    throw new LinkedInAuthError('Tokenul LinkedIn a expirat — reconectează pagina din /socials → LinkedIn');
  }
  return { token: decryptSecret(row.access_token_enc), organizationUrn: row.organization_urn };
}
