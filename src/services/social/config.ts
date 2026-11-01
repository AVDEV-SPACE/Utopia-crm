/**
 * Configurația integrării Meta (Facebook Page + Instagram Business), din env.
 * Valorile secrete (token, app secret) nu se loghează și nu ajung în UI.
 */

const DEFAULT_GRAPH_VERSION = 'v26.0';

export type SocialChannel = 'facebook' | 'instagram';

export function graphVersion(): string {
  return process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;
}

export function fbPageId(): string | null {
  return process.env.FB_PAGE_ID?.trim() || null;
}

export function igBusinessId(): string | null {
  return process.env.IG_BUSINESS_ID?.trim() || null;
}

/** Tenant-ul căruia îi aparțin pagina și contul IG (orgId Clerk sau `user:<clerkUserId>`). */
export function socialOrgId(): string | null {
  return process.env.SOCIAL_ORG_ID?.trim() || null;
}

/** Ce lipsește din env pentru integrare (doar numele variabilelor, fără valori). */
export function missingSocialEnv(): string[] {
  const required = ['META_APP_ID', 'META_APP_SECRET', 'META_SYSTEM_USER_TOKEN', 'FB_PAGE_ID', 'IG_BUSINESS_ID', 'SOCIAL_ORG_ID'];
  return required.filter((name) => !process.env[name]?.trim());
}

export function isSocialConfigured(): boolean {
  return missingSocialEnv().length === 0;
}

/**
 * Pagina sau contul IG al unui eveniment de webhook → canalul. Orice alt id
 * (o pagină care nu e a noastră) se ignoră.
 */
export function channelForAccount(accountId: string): SocialChannel | null {
  if (accountId && accountId === fbPageId()) return 'facebook';
  if (accountId && accountId === igBusinessId()) return 'instagram';
  return null;
}
