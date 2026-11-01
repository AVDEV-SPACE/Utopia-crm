/**
 * Abonează aplicația Meta la evenimentele paginii de Facebook (DM-uri,
 * postback-uri, comentarii pe feed), apoi verifică abonarea.
 *
 * Rulare locală, cu variabilele din .env (nu se afișează niciun token):
 *   node --env-file=.env node_modules/jiti/lib/jiti-cli.mjs scripts/meta-subscribe.ts
 *
 * Evenimentele Instagram (DM-uri, comentarii) se abonează din App Dashboard →
 * Webhooks → obiectul „Instagram” (câmpurile messages, comments), cu același
 * URL de callback; pagina trebuie să fie abonată (pasul de aici) ca să le primească.
 *
 * Script independent (fără importuri din src/): rulează fără alias-uri și build.
 */
import { createHmac } from 'crypto';

const FIELDS = ['messages', 'messaging_postbacks', 'feed'];

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nu este setat în .env`);
  return value;
}

const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';

async function graph<T>(path: string, token: string, method: 'GET' | 'POST' = 'GET', params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('appsecret_proof', createHmac('sha256', env('META_APP_SECRET')).update(token).digest('hex'));

  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || data.error) throw new Error(`Graph ${res.status} (cod ${data.error?.code ?? '—'}): ${data.error?.message ?? 'eroare'}`);
  return data;
}

async function main() {
  const pageId = env('FB_PAGE_ID');
  const appId = env('META_APP_ID');

  const page = await graph<{ access_token?: string; name?: string }>(pageId, env('META_SYSTEM_USER_TOKEN'), 'GET', {
    fields: 'access_token,name',
  });
  if (!page.access_token) throw new Error('Tokenul paginii lipsește — verifică permisiunile system user-ului pe pagină');
  console.log(`Pagina: ${page.name ?? pageId}`);

  const subscribe = await graph<{ success?: boolean }>(`${pageId}/subscribed_apps`, page.access_token, 'POST', {
    subscribed_fields: FIELDS.join(','),
  });
  console.log(`Abonare: ${subscribe.success ? 'reușită' : 'fără confirmare'}`);

  const apps = await graph<{ data?: { id?: string; name?: string; subscribed_fields?: string[] }[] }>(
    `${pageId}/subscribed_apps`,
    page.access_token
  );
  const ours = apps.data?.find((a) => a.id === appId);
  if (!ours) {
    console.error('Aplicația NU apare printre aplicațiile abonate la pagină.');
    process.exitCode = 1;
    return;
  }
  console.log(`Verificare: ${ours.name ?? appId} abonată la ${(ours.subscribed_fields ?? []).join(', ')}`);
}

main().catch((error: Error) => {
  console.error(`Eroare: ${error.message}`);
  process.exitCode = 1;
});
