import { linkedin, LinkedInError } from './api';
import { linkedinClientId, linkedinRedirectUri, LINKEDIN_SCOPES } from './config';

/**
 * OAuth 2.0 (3-legged) pentru pagina de companie: adminul paginii autorizează
 * aplicația o dată, din /socials → LinkedIn → „Conectează”. Tokenul de acces
 * ține 60 de zile; refresh token-ul (365 de zile, fix de la prima autorizare)
 * vine doar dacă LinkedIn i-l acordă aplicației.
 */

const OAUTH_BASE = 'https://www.linkedin.com/oauth/v2';

export interface TokenSet {
  accessToken: string;
  /** Secunde până la expirarea tokenului de acces */
  expiresIn: number;
  refreshToken: string | null;
  refreshExpiresIn: number | null;
  scope: string;
}

function clientSecret(): string {
  const secret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!secret) throw new LinkedInError('LINKEDIN_CLIENT_SECRET nu este setat', 500, null);
  return secret;
}

function clientId(): string {
  const id = linkedinClientId();
  if (!id) throw new LinkedInError('LINKEDIN_CLIENT_ID nu este setat', 500, null);
  return id;
}

function redirectUri(): string {
  const uri = linkedinRedirectUri();
  if (!uri) throw new LinkedInError('NEXT_PUBLIC_APP_URL nu este setat (redirect URL-ul OAuth)', 500, null);
  return uri;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri(),
    state,
    scope: LINKEDIN_SCOPES.join(' '),
  });
  return `${OAUTH_BASE}/authorization?${params.toString()}`;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  let res: Response;
  try {
    res = await fetch(`${OAUTH_BASE}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...params, client_id: clientId(), client_secret: clientSecret() }).toString(),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch (error) {
    throw new LinkedInError(`OAuth LinkedIn: ${(error as Error).message}`, 504, null);
  }

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new LinkedInError(`OAuth LinkedIn ${res.status}: ${data.error_description ?? data.error ?? 'răspuns invalid'}`, res.status, data.error ?? null);
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 60 * 24 * 3600,
    refreshToken: data.refresh_token ?? null,
    refreshExpiresIn: data.refresh_token_expires_in ?? null,
    scope: data.scope ?? '',
  };
}

export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

/** Adminul care a autorizat (r_basicprofile): URN-ul și numele, doar pentru afișare. */
export async function fetchMember(token: string): Promise<{ urn: string | null; name: string | null }> {
  let res: Response;
  try {
    res = await fetch('https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch {
    return { urn: null, name: null };
  }
  if (!res.ok) return { urn: null, name: null };
  const me = (await res.json().catch(() => ({}))) as { id?: string; localizedFirstName?: string; localizedLastName?: string };
  const name = [me.localizedFirstName, me.localizedLastName].filter(Boolean).join(' ') || null;
  return { urn: me.id ? `urn:li:person:${me.id}` : null, name };
}

/** Paginile pe care membrul autorizat e ADMINISTRATOR aprobat (rw_organization_admin). */
export async function administeredOrganizations(token: string): Promise<string[]> {
  const { data } = await linkedin<{ elements?: { organization?: string; organizationTarget?: string }[] }>('organizationAcls', {
    token,
    query: 'q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100',
  });
  return (data.elements ?? []).map((e) => e.organization ?? e.organizationTarget ?? '').filter(Boolean);
}
