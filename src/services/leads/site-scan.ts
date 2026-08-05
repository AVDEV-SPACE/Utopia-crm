export interface SiteScanResult {
  reachable: boolean;
  hasHttps: boolean;
  hasSsl: boolean;
  responseTimeMs: number | null;
  hasMetaViewport: boolean;
  lastUpdatedEstimate: string | null;
}

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UtopiaLeadScan/1.0)' },
    });
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
