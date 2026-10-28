import { isPublicHttpUrl } from '@/services/leads/site-scan';

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** User-Agent pentru serviciile OSM; politica lor cere un contact. */
export function osmUserAgent(): string {
  const contact = process.env.NOMINATIM_CONTACT_EMAIL;
  return `UtopiaCRM-LeadEngine/1.0 (${contact ?? 'contact via UTOPIA_SITE_URL'})`;
}

export interface FetchedPage {
  ok: boolean;
  status: number | null;
  /** URL-ul final, după redirecționări */
  url: string;
  html: string;
  error?: string;
}

const MAX_REDIRECTS = 5;

/**
 * Descarcă o pagină publică: timeout total, maximum `maxBytes` citiți din
 * body (restul se abandonează) și protecție SSRF la fiecare redirect —
 * website-ul vine din date externe (OSM, CSV), deci nu are voie să ducă la
 * adrese interne.
 */
export async function fetchPage(url: string, timeoutMs = 10_000, maxBytes = 800_000): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let current = url;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!isPublicHttpUrl(current)) return { ok: false, status: null, url: current, html: '', error: 'adresă nepermisă' };

      const res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; UtopiaLeadEngine/1.0)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ro,en;q=0.8',
        },
      });

      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location) {
        await res.body?.cancel().catch(() => undefined);
        current = new URL(location, current).toString();
        continue;
      }

      const type = res.headers.get('content-type') ?? '';
      if (type && !/html|xml|text\/plain/i.test(type)) {
        await res.body?.cancel().catch(() => undefined);
        return { ok: false, status: res.status, url: current, html: '', error: `conținut ${type}` };
      }

      const html = await readLimited(res, maxBytes);
      return { ok: res.ok, status: res.status, url: current, html };
    }
    return { ok: false, status: null, url: current, html: '', error: 'prea multe redirecționări' };
  } catch (err) {
    const message = (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message;
    return { ok: false, status: null, url: current, html: '', error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let text = '';

  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.byteLength + received > maxBytes ? value.subarray(0, maxBytes - received) : value;
    received += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text + decoder.decode();
}

/** Rulează `worker` peste `items` cu cel mult `limit` în paralel, păstrând ordinea. */
export async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(lanes);
  return results;
}
