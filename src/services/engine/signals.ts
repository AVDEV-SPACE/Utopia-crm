import { domainOf, normalizeEmail } from './normalize';

/**
 * Semnale verificabile extrase din HTML-ul site-ului. Doar fapte: dacă site-ul
 * nu s-a încărcat (sau HTML-ul e prea mic ca să spună ceva), nu producem
 * nicio problemă de audit — absența unui semn nu e dovadă pe o pagină goală.
 */
export const MIN_HTML_LENGTH = 500;

export interface SiteSignals {
  siteLoaded: boolean;
  metaPixel: boolean;
  googleAds: boolean;
  gtag: boolean;
  booking: boolean;
  chat: boolean;
  viewport: boolean;
  https: boolean;
  copyrightYear: number | null;
}

export interface SiteFacts {
  signals: SiteSignals;
  emails: string[];
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
}

const IGNORED_EMAIL = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js)$|sentry|wixpress|example\.|@example|domain\.com|email\.com|yourname|nume@|test@|\d+x\./i;

/** Segmente de URL care nu sunt profilul firmei (postări, butoane de share etc.). */
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'share', 'direct']);
const FACEBOOK_RESERVED = new Set(['sharer', 'sharer.php', 'share', 'plugins', 'tr', 'dialog', 'login', 'groups', 'events', 'watch', 'photo', 'photo.php', 'help', 'policies', 'privacy']);

function firstProfile(html: string, pattern: RegExp, reserved: Set<string>): string | null {
  for (const match of html.matchAll(pattern)) {
    const slug = match[1]?.replace(/\/$/, '');
    if (slug && !reserved.has(slug.toLowerCase())) {
      const raw = match[0];
      return (raw.startsWith('//') ? `https:${raw}` : raw).replace(/^http:/i, 'https:').replace(/\/$/, '');
    }
  }
  return null;
}

export function extractEmails(html: string, siteUrl: string | null): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/(?:mailto:)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const email = normalizeEmail(match[1]);
    if (email && !IGNORED_EMAIL.test(email)) found.add(email);
  }
  // Adresele de pe domeniul site-ului întâi: sunt cele ale firmei, nu ale agenției web
  const siteDomain = domainOf(siteUrl);
  return [...found].sort((a, b) => Number(b.endsWith(`@${siteDomain}`)) - Number(a.endsWith(`@${siteDomain}`)));
}

/** Cel mai recent an dintr-o mențiune de copyright (© 2019 sau © 2015–2019). */
export function extractCopyrightYear(html: string, now = new Date()): number | null {
  const current = now.getFullYear();
  let best: number | null = null;
  const pattern = /(?:©|&copy;|&#169;|copyright)[^0-9<]{0,30}((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/gi;
  for (const match of html.matchAll(pattern)) {
    const year = Number(match[2] ?? match[1]);
    if (year >= 1995 && year <= current && (best === null || year > best)) best = year;
  }
  return best;
}

export function extractSiteFacts(html: string, finalUrl: string | null): SiteFacts {
  const siteLoaded = html.length > MIN_HTML_LENGTH;
  const lower = html.toLowerCase();

  const signals: SiteSignals = {
    siteLoaded,
    metaPixel: /connect\.facebook\.net|fbq\(/.test(lower),
    googleAds: /AW-\d{6,}/.test(html) || /googleadservices|googleads\.g\.doubleclick/.test(lower),
    gtag: /googletagmanager\.com|gtag\(|google-analytics\.com/.test(lower),
    booking: /calendly|booksy|fresha|simplybook|programare|rezerv|booking/.test(lower),
    chat: /tawk\.to|intercom|crisp\.chat|livechat|tidio|manychat|whatsapp|wa\.me\//.test(lower),
    viewport: /<meta[^>]+name=["']?viewport/i.test(html),
    https: Boolean(finalUrl?.startsWith('https://')),
    copyrightYear: siteLoaded ? extractCopyrightYear(html) : null,
  };

  return {
    signals,
    emails: siteLoaded ? extractEmails(html, finalUrl) : [],
    instagram: firstProfile(html, /(?:https?:)?\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]+)\/?/gi, INSTAGRAM_RESERVED),
    facebook: firstProfile(html, /(?:https?:)?\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9_.\-]+(?:\.php)?)\/?/gi, FACEBOOK_RESERVED),
    linkedin: firstProfile(html, /(?:https?:)?\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/([A-Za-z0-9_\-%.]+)\/?/gi, new Set()),
  };
}

/**
 * Problemele din audit, în română. Goale dacă site-ul nu s-a încărcat — atunci
 * nu facem nicio afirmație despre site.
 */
export function auditIssues(signals: SiteSignals, now = new Date()): string[] {
  if (!signals.siteLoaded) return [];
  const issues: string[] = [];
  if (!signals.viewport) issues.push('site neadaptat pentru mobil (lipsește meta viewport)');
  if (!signals.https) issues.push('site fără HTTPS');
  if (signals.copyrightYear !== null && signals.copyrightYear <= now.getFullYear() - 3) {
    issues.push(`copyright din ${signals.copyrightYear} — site neactualizat`);
  }
  if (!signals.booking) issues.push('fără programare/rezervare online');
  if (!signals.gtag && !signals.metaPixel) issues.push('fără analytics vizibil');
  if (!signals.chat) issues.push('fără chat pe site');
  return issues;
}
