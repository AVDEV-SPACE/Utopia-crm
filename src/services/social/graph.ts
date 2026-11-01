import { createHmac } from 'crypto';
import { sleep } from '@/services/engine/http';
import { fbPageId, graphVersion, igBusinessId, type SocialChannel } from './config';

/**
 * Client Graph API (Facebook Page + Instagram Business). Formatul Graph nu
 * iese din acest fișier. Fiecare apel are timeout și `appsecret_proof`; tokenii
 * nu apar niciodată în erori sau în log-uri.
 *
 * Tokenul paginii se derivă din META_SYSTEM_USER_TOKEN (GET /{page}?fields=access_token)
 * și se păstrează în memorie câteva minute (aceeași invocare / instanță caldă).
 */

const TIMEOUT_MS = 15_000;
const PAGE_TOKEN_TTL_MS = 10 * 60_000;

/** Limitele de text ale platformelor (Messenger 2000, Instagram 1000). */
export const MESSAGE_MAX_CHARS: Record<SocialChannel, number> = { facebook: 2000, instagram: 1000 };

export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Codul de eroare Meta (ex. 10 = permisiune, 190 = token invalid, 551 = fereastra de 24h) */
    readonly code: number | null,
    readonly subcode: number | null
  ) {
    super(message);
    this.name = 'GraphError';
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

function systemToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) throw new GraphError('META_SYSTEM_USER_TOKEN nu este setat', 500, null, null);
  return token;
}

function requireId(value: string | null, name: string): string {
  if (!value) throw new GraphError(`${name} nu este setat`, 500, null, null);
  return value;
}

/** HMAC-SHA256(app secret, token): Meta respinge apelurile fără el dacă „Require App Secret” e activ. */
function appSecretProof(token: string): string | null {
  const secret = process.env.META_APP_SECRET;
  return secret ? createHmac('sha256', secret).update(token).digest('hex') : null;
}

async function graph<T>(
  path: string,
  options: { token: string; method?: 'GET' | 'POST'; params?: Record<string, string>; body?: Record<string, unknown> }
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(options.params ?? {})) url.searchParams.set(key, value);
  const proof = appSecretProof(options.token);
  if (proof) url.searchParams.set('appsecret_proof', proof);

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    const timeout = (error as Error).name === 'TimeoutError';
    throw new GraphError(timeout ? 'Graph API: timeout' : `Graph API: ${(error as Error).message}`, 504, null, null);
  }

  const data = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new GraphError(`Graph API ${res.status}: ${e.message ?? 'eroare necunoscută'}`, res.status, e.code ?? null, e.error_subcode ?? null);
  }
  return data;
}

let pageTokenCache: { token: string; expiresAt: number } | null = null;

async function pageToken(): Promise<string> {
  if (pageTokenCache && pageTokenCache.expiresAt > Date.now()) return pageTokenCache.token;
  const page = requireId(fbPageId(), 'FB_PAGE_ID');
  const data = await graph<{ access_token?: string }>(page, { token: systemToken(), params: { fields: 'access_token' } });
  if (!data.access_token) throw new GraphError('Tokenul paginii nu a putut fi obținut (permisiuni lipsă?)', 403, null, null);
  pageTokenCache = { token: data.access_token, expiresAt: Date.now() + PAGE_TOKEN_TTL_MS };
  return data.access_token;
}

// ── Mesaje directe ──────────────────────────────────────────────────────────

/**
 * Răspuns într-o conversație începută de client (`messaging_type: RESPONSE`),
 * deci doar în fereastra de 24h. Facebook și Instagram trec prin același
 * endpoint al paginii. Întoarce `mid`-ul mesajului trimis.
 */
async function sendMessage(recipientId: string, text: string, channel: SocialChannel): Promise<string | null> {
  const page = requireId(fbPageId(), 'FB_PAGE_ID');
  const data = await graph<{ message_id?: string }>(`${page}/messages`, {
    token: await pageToken(),
    method: 'POST',
    body: {
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: text.slice(0, MESSAGE_MAX_CHARS[channel]) },
    },
  });
  return data.message_id ?? null;
}

export const sendPageMessage = (psid: string, text: string) => sendMessage(psid, text, 'facebook');
export const sendInstagramMessage = (igsid: string, text: string) => sendMessage(igsid, text, 'instagram');

// ── Comentarii ──────────────────────────────────────────────────────────────

/** Răspuns public la un comentariu de pe pagină. Întoarce id-ul comentariului nou. */
export async function replyFacebookComment(commentId: string, text: string): Promise<string | null> {
  const data = await graph<{ id?: string }>(`${commentId}/comments`, {
    token: await pageToken(),
    method: 'POST',
    body: { message: text.slice(0, 8000) },
  });
  return data.id ?? null;
}

/** Răspuns public la un comentariu Instagram. */
export async function replyInstagramComment(commentId: string, text: string): Promise<string | null> {
  const data = await graph<{ id?: string }>(`${commentId}/replies`, {
    token: await pageToken(),
    method: 'POST',
    body: { message: text.slice(0, 2200) },
  });
  return data.id ?? null;
}

// ── Postări ─────────────────────────────────────────────────────────────────

/** Postare pe pagină: cu imagine (/photos) sau doar text (/feed). Întoarce id-ul postării. */
export async function publishFacebookPost(caption: string, imageUrl?: string | null): Promise<string> {
  const page = requireId(fbPageId(), 'FB_PAGE_ID');
  const token = await pageToken();
  if (imageUrl) {
    const data = await graph<{ id?: string; post_id?: string }>(`${page}/photos`, {
      token,
      method: 'POST',
      body: { url: imageUrl, caption },
    });
    const id = data.post_id ?? data.id;
    if (!id) throw new GraphError('Facebook nu a întors id-ul postării', 502, null, null);
    return id;
  }
  const data = await graph<{ id?: string }>(`${page}/feed`, { token, method: 'POST', body: { message: caption } });
  if (!data.id) throw new GraphError('Facebook nu a întors id-ul postării', 502, null, null);
  return data.id;
}

/** Cât așteptăm ca Instagram să proceseze imaginea înainte de publicare. */
const IG_CONTAINER_WAIT_MS = 60_000;
const IG_POLL_MS = 3_000;

/**
 * Postare Instagram în doi pași: containerul media (/media), așteptarea
 * procesării (`status_code` FINISHED), apoi publicarea (/media_publish).
 * Instagram cere imagine (URL public, JPEG).
 */
export async function publishInstagramPost(caption: string, imageUrl: string): Promise<string> {
  const ig = requireId(igBusinessId(), 'IG_BUSINESS_ID');
  const token = await pageToken();
  const container = await graph<{ id?: string }>(`${ig}/media`, {
    token,
    method: 'POST',
    body: { image_url: imageUrl, caption },
  });
  if (!container.id) throw new GraphError('Instagram nu a creat containerul media', 502, null, null);

  const deadline = Date.now() + IG_CONTAINER_WAIT_MS;
  for (;;) {
    const status = await graph<{ status_code?: string }>(container.id, { token, params: { fields: 'status_code' } });
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new GraphError(`Instagram a respins media (${status.status_code})`, 422, null, null);
    }
    if (Date.now() > deadline) throw new GraphError('Instagram procesează încă imaginea — reîncearcă', 504, null, null);
    await sleep(IG_POLL_MS);
  }

  const published = await graph<{ id?: string }>(`${ig}/media_publish`, {
    token,
    method: 'POST',
    body: { creation_id: container.id },
  });
  if (!published.id) throw new GraphError('Instagram nu a întors id-ul postării', 502, null, null);
  return published.id;
}

// ── Profiluri ───────────────────────────────────────────────────────────────

export interface SocialProfile {
  name: string | null;
  /** Doar pe Instagram */
  username: string | null;
}

/** Numele persoanei (PSID / IGSID). Eșecul nu e fatal: apelantul folosește un nume generic. */
export async function getProfile(channel: SocialChannel, userId: string): Promise<SocialProfile> {
  const token = await pageToken();
  if (channel === 'instagram') {
    const data = await graph<{ name?: string; username?: string }>(userId, { token, params: { fields: 'name,username' } });
    return { name: data.name ?? data.username ?? null, username: data.username ?? null };
  }
  const data = await graph<{ first_name?: string; last_name?: string }>(userId, { token, params: { fields: 'first_name,last_name' } });
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return { name: name || null, username: null };
}

// ── Starea conexiunii (pagina de setări) și abonarea webhook-ului ───────────

export interface ConnectionCheck {
  ok: boolean;
  detail: string;
}

export interface SocialConnectionStatus {
  token: ConnectionCheck;
  page: ConnectionCheck;
  instagram: ConnectionCheck;
  webhook: ConnectionCheck;
}

const fail = (error: unknown): ConnectionCheck => ({ ok: false, detail: error instanceof Error ? error.message : 'eroare' });

/** Verificări live, fără să întoarcă vreun token. */
export async function checkConnection(): Promise<SocialConnectionStatus> {
  const status: SocialConnectionStatus = {
    token: { ok: false, detail: 'neverificat' },
    page: { ok: false, detail: 'neverificat' },
    instagram: { ok: false, detail: 'neverificat' },
    webhook: { ok: false, detail: 'neverificat' },
  };

  try {
    const me = await graph<{ name?: string }>('me', { token: systemToken(), params: { fields: 'id,name' } });
    status.token = { ok: true, detail: me.name ? `System user: ${me.name}` : 'valid' };
  } catch (error) {
    status.token = fail(error);
    return status;
  }

  try {
    const page = requireId(fbPageId(), 'FB_PAGE_ID');
    const token = await pageToken();
    const info = await graph<{ name?: string }>(page, { token, params: { fields: 'name' } });
    status.page = { ok: true, detail: info.name ?? page };

    const apps = await graph<{ data?: { id?: string; subscribed_fields?: string[] }[] }>(`${page}/subscribed_apps`, { token });
    const ours = apps.data?.find((a) => a.id === process.env.META_APP_ID);
    status.webhook = ours
      ? { ok: true, detail: `abonat: ${(ours.subscribed_fields ?? []).join(', ') || '—'}` }
      : { ok: false, detail: 'aplicația nu e abonată la pagină (rulează scripts/meta-subscribe.ts)' };
  } catch (error) {
    status.page = status.page.ok ? status.page : fail(error);
    if (status.page.ok) status.webhook = fail(error);
  }

  try {
    const ig = requireId(igBusinessId(), 'IG_BUSINESS_ID');
    const info = await graph<{ username?: string }>(ig, { token: await pageToken(), params: { fields: 'username' } });
    status.instagram = { ok: true, detail: info.username ? `@${info.username}` : ig };
  } catch (error) {
    status.instagram = fail(error);
  }

  return status;
}

/** Abonează aplicația la evenimentele paginii (folosit de scripts/meta-subscribe.ts). */
export async function subscribePageApp(fields: string[]): Promise<{ success: boolean; subscribed: string[] }> {
  const page = requireId(fbPageId(), 'FB_PAGE_ID');
  const token = await pageToken();
  const result = await graph<{ success?: boolean }>(`${page}/subscribed_apps`, {
    token,
    method: 'POST',
    params: { subscribed_fields: fields.join(',') },
  });
  const apps = await graph<{ data?: { id?: string; subscribed_fields?: string[] }[] }>(`${page}/subscribed_apps`, { token });
  const ours = apps.data?.find((a) => a.id === process.env.META_APP_ID);
  return { success: Boolean(result.success), subscribed: ours?.subscribed_fields ?? [] };
}
