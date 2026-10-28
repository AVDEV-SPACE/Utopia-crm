/**
 * Normalizări comune motorului: website, domeniu, cheia de deduplicare.
 * Domeniul se calculează la fel ca în coloana generată `leads.domain`
 * (setup-db-engine.sql), ca deduplicarea din cod să se potrivească cu DB-ul.
 */

/** Gazde care nu sunt site-ul firmei, chiar dacă OSM le pune la `website`. */
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'instagram.com', 'linkedin.com', 'tiktok.com', 'youtube.com', 'wa.me'];

/** Domenii de email gratuite: nu identifică firma, deci nu sunt cheie de deduplicare. */
const FREE_MAIL = new Set([
  'gmail.com', 'yahoo.com', 'yahoo.ro', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com',
  'protonmail.com', 'proton.me', 'mail.com', 'gmx.com', 'gmx.net', 'aol.com', 'ymail.com',
]);

/** „www.x.ro” / „x.ro/” → „https://www.x.ro”. `null` dacă nu arată a URL. */
export function normalizeWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim().split(/[\s;,]+/)[0];
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/+/, '')}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/** Domeniul unui URL, fără `www.`, cu litere mici. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function isSocialUrl(url: string | null | undefined): boolean {
  const domain = domainOf(url);
  return Boolean(domain && SOCIAL_HOSTS.some((h) => domain === h || domain.endsWith(`.${h}`)));
}

/** Domeniul unui email de firmă (nu gmail/yahoo...). */
export function businessEmailDomain(email: string | null | undefined): string | null {
  const domain = email?.split('@')[1]?.trim().toLowerCase();
  return domain && !FREE_MAIL.has(domain) ? domain : null;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = raw?.trim().toLowerCase().replace(/^mailto:/, '').split(/[\s;,?]+/)[0];
  return email && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) ? email : null;
}
