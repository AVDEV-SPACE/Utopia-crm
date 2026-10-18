export interface SiteScanResult {
  reachable: boolean;
  hasHttps: boolean;
  hasSsl: boolean;
  responseTimeMs: number | null;
  hasMetaViewport: boolean;
  lastUpdatedEstimate: string | null;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;

/**
 * Website-ul vine din datele lead-ului (import, formular, editare manuală),
 * deci serverul nu trebuie să-l poată folosi ca să ajungă la adrese interne
 * (SSRF): doar http(s), fără localhost, IP-uri private/link-local sau
 * domenii interne. Verificarea se repetă la fiecare redirect.
 */
function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  // IPv6 literal: loopback, unspecified, unique-local, link-local, IPv4-mapped
  if (host.includes(':')) {
    return !(host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:'));
  }
  return true;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isPublicHttpUrl(current)) throw new Error('Adresă nepermisă pentru scanare');
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UtopiaLeadScan/1.0)' },
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!location) return res;
      current = new URL(location, current).toString();
    }
    throw new Error('Prea multe redirecționări');
  } finally {
    clearTimeout(timeout);
  }
}

export async function scanWebsite(website: string): Promise<SiteScanResult> {
  const hasHttps = website.startsWith('https://');
  const httpsUrl = website.startsWith('http://') ? website.replace('http://', 'https://') : website;

  const start = Date.now();
  try {
    const res = await fetchWithTimeout(httpsUrl);
    const responseTimeMs = Date.now() - start;
    const html = await res.text();

    return {
      reachable: res.ok,
      hasHttps,
      hasSsl: true, // fetch-ul peste https a reușit fără eroare de certificat
      responseTimeMs,
      hasMetaViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      lastUpdatedEstimate: res.headers.get('last-modified'),
    };
  } catch {
    return {
      reachable: false,
      hasHttps,
      hasSsl: false,
      responseTimeMs: null,
      hasMetaViewport: false,
      lastUpdatedEstimate: null,
    };
  }
}
