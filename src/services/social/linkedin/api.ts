import { linkedinApiVersion } from './config';

/**
 * Client REST LinkedIn (Marketing / Community Management API, versionat).
 * Formatul LinkedIn nu iese din folderul `linkedin/`. Fiecare apel are timeout;
 * tokenul nu apare niciodată în erori sau în log-uri.
 */

const API_BASE = 'https://api.linkedin.com/rest';
const TIMEOUT_MS = 15_000;

export class LinkedInError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** `serviceErrorCode` / `code` din răspunsul LinkedIn, dacă există */
    readonly code: string | null
  ) {
    super(message);
    this.name = 'LinkedInError';
  }
}

interface LinkedInErrorBody {
  message?: string;
  serviceErrorCode?: number;
  code?: string;
}

/** Un URN în cale: Rest.li 2.0 cere `:`, `(`, `)`, `,` codate. */
export const encodeUrn = (urn: string) => encodeURIComponent(urn);

export interface LinkedInResponse<T> {
  data: T;
  /** Antetul `x-restli-id`: id-ul entității create (postare, comentariu) */
  restliId: string | null;
}

export async function linkedin<T>(
  path: string,
  options: {
    token: string;
    method?: 'GET' | 'POST' | 'DELETE';
    /** Parametrii de query; valorile sunt deja în formatul Rest.li (ex. `List(...)`) */
    query?: string;
    body?: unknown;
    timeoutMs?: number;
    /** Antete suplimentare (ex. `X-RestLi-Method: FINDER` pentru căutări) */
    headers?: Record<string, string>;
  }
): Promise<LinkedInResponse<T>> {
  const url = `${API_BASE}/${path.replace(/^\//, '')}${options.query ? `?${options.query}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Linkedin-Version': linkedinApiVersion(),
        'X-Restli-Protocol-Version': '2.0.0',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const timeout = (error as Error).name === 'TimeoutError';
    throw new LinkedInError(timeout ? 'LinkedIn API: timeout' : `LinkedIn API: ${(error as Error).message}`, 504, null);
  }

  const text = await res.text();
  const json = text ? (safeJson(text) as T & LinkedInErrorBody) : ({} as T & LinkedInErrorBody);
  if (!res.ok) {
    const code = json.code ?? (json.serviceErrorCode != null ? String(json.serviceErrorCode) : null);
    throw new LinkedInError(`LinkedIn API ${res.status}: ${json.message ?? 'eroare necunoscută'}`, res.status, code);
  }
  return { data: json as T, restliId: res.headers.get('x-restli-id') };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Încărcarea binarului unei imagini la URL-ul primit de la `images?action=initializeUpload`. */
export async function uploadBinary(uploadUrl: string, token: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      body: bytes,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new LinkedInError(`Upload LinkedIn: ${(error as Error).message}`, 504, null);
  }
  if (!res.ok) throw new LinkedInError(`Upload LinkedIn ${res.status}`, res.status, null);
}
