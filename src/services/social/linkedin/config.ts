/**
 * Configurația integrării LinkedIn (pagina de companie), din env.
 * Client Secret-ul și cheia de criptare nu se loghează și nu ajung în UI.
 */

/** Cookie-ul cu `state`-ul OAuth (anti-CSRF): setat la „Conectează”, verificat în callback. */
export const LINKEDIN_STATE_COOKIE = 'li_oauth_state';

/** Versiunea Marketing API (antetul `Linkedin-Version`, format YYYYMM). */
const DEFAULT_API_VERSION = '202611';

/**
 * Permisiunile Community Management API cerute la autorizare:
 * publicare și citire ca organizație, comentarii pe postările paginii,
 * rolul de admin (verificarea paginii) și profilul de bază al adminului.
 */
export const LINKEDIN_SCOPES = [
  'w_organization_social',
  'r_organization_social',
  'w_organization_social_feed',
  'r_organization_social_feed',
  'rw_organization_admin',
  'r_basicprofile',
] as const;

export function linkedinApiVersion(): string {
  return process.env.LINKEDIN_API_VERSION?.trim() || DEFAULT_API_VERSION;
}

export function linkedinClientId(): string | null {
  return process.env.LINKEDIN_CLIENT_ID?.trim() || null;
}

export function linkedinOrgId(): string | null {
  return process.env.LINKEDIN_ORG_ID?.trim() || null;
}

export function linkedinOrgUrn(): string | null {
  const id = linkedinOrgId();
  return id ? `urn:li:organization:${id}` : null;
}

/** URL-ul public al CRM-ului (fără `/` la final); pe Vercel, fallback pe domeniul deploy-ului. */
export function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return base.replace(/\/+$/, '');
}

/** Redirect URL-ul OAuth — trebuie adăugat identic în aplicația LinkedIn (Auth → Authorized redirect URLs). */
export function linkedinRedirectUri(): string | null {
  const base = appBaseUrl();
  return base ? `${base}/api/socials/linkedin/callback` : null;
}

/** Ce lipsește din env pentru LinkedIn (doar numele variabilelor, fără valori). */
export function missingLinkedinEnv(): string[] {
  const required = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ORG_ID', 'SOCIAL_TOKEN_KEY', 'SOCIAL_ORG_ID'];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (!appBaseUrl()) missing.push('NEXT_PUBLIC_APP_URL');
  return missing;
}

export function isLinkedinConfigured(): boolean {
  return missingLinkedinEnv().length === 0;
}
