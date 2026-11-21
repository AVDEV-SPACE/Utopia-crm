// src/lib/data-cache.ts
//
// Cache în memorie pentru răspunsurile JSON ale paginilor (stale-while-revalidate):
//  - la revenirea pe o pagină, datele din cache se afișează instant, iar
//    pagina le reîmprospătează în fundal — skeleton-ul apare doar la prima vizită;
//  - `preload` (hover pe sidebar) pornește citirea înainte de click;
//  - request-urile identice aflate în zbor se unesc (un singur fetch).
// Trăiește cât tab-ul: un refresh complet al paginii golește cache-ul.

interface Entry {
  data: unknown;
  at: number;
}

const MAX_ENTRIES = 40;
const DEFAULT_MAX_AGE_MS = 30_000;

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** Ultimul răspuns salvat pentru URL, oricât de vechi (afișat cât timp vine cel nou). */
export function peek<T>(url: string): T | undefined {
  return cache.get(url)?.data as T | undefined;
}

export function store(url: string, data: unknown) {
  // Reinserarea mută cheia la capăt: cele mai vechi ies primele când cache-ul e plin
  cache.delete(url);
  cache.set(url, { data, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

function isFresh(url: string, maxAgeMs: number) {
  const entry = cache.get(url);
  return !!entry && Date.now() - entry.at < maxAgeMs;
}

/**
 * GET JSON + salvare în cache. Fără `signal`, request-urile identice în zbor se
 * reutilizează. Cu `signal` (pagini care anulează citirile vechi), merge separat.
 */
export async function fetchJson<T>(url: string, init?: { signal?: AbortSignal }): Promise<T> {
  if (!init?.signal) {
    const pending = inflight.get(url);
    if (pending) return pending as Promise<T>;
  }
  const request = (async () => {
    const res = await fetch(url, { cache: 'no-store', signal: init?.signal });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const data = (await res.json()) as T;
    store(url, data);
    return data;
  })();
  if (!init?.signal) {
    inflight.set(url, request);
    request.finally(() => inflight.delete(url)).catch(() => {});
  }
  return request;
}

/** Pornește citirea dacă nu există un răspuns proaspăt; erorile sunt ignorate (pagina reîncearcă). */
export function preload(url: string, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (isFresh(url, maxAgeMs) || inflight.has(url)) return;
  fetchJson(url).catch(() => {});
}
