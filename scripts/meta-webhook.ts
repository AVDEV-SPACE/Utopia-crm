/**
 * Configurează webhook-ul aplicației Meta (echivalentul App Dashboard →
 * Webhooks): URL-ul de callback și verify token-ul, pentru obiectele Page
 * (messages, messaging_postbacks, feed) și Instagram (messages, comments).
 * Apoi listează abonările, ca verificare.
 *
 * Rulează DUPĂ deploy: Meta face imediat un GET de verificare pe URL, deci
 * /api/webhooks/meta trebuie să fie live cu același META_WEBHOOK_VERIFY_TOKEN.
 *
 *   node --env-file=.env node_modules/jiti/lib/jiti-cli.mjs scripts/meta-webhook.ts
 *
 * Folosește tokenul de aplicație (APP_ID|APP_SECRET); nu afișează niciun secret.
 * Script independent (fără importuri din src/).
 */

const OBJECTS: { object: 'page' | 'instagram'; fields: string[] }[] = [
  { object: 'page', fields: ['messages', 'messaging_postbacks', 'feed'] },
  { object: 'instagram', fields: ['messages', 'comments'] },
];

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} nu este setat în .env`);
  return value;
}

async function graph<T>(path: string, method: 'GET' | 'POST', params: Record<string, string>): Promise<T> {
  const version = process.env.META_GRAPH_VERSION?.trim() || 'v26.0';
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { method, signal: AbortSignal.timeout(20_000) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || data.error) throw new Error(`Graph ${res.status} (cod ${data.error?.code ?? '—'}): ${data.error?.message ?? 'eroare'}`);
  return data;
}

async function main() {
  const appId = env('META_APP_ID');
  const appToken = `${appId}|${env('META_APP_SECRET')}`;
  const base = env('NEXT_PUBLIC_APP_URL').replace(/\/+$/, '');
  const callbackUrl = `${base}/api/webhooks/meta`;
  const verifyToken = env('META_WEBHOOK_VERIFY_TOKEN');

  console.log(`Callback: ${callbackUrl}`);
  for (const { object, fields } of OBJECTS) {
    const result = await graph<{ success?: boolean }>(`${appId}/subscriptions`, 'POST', {
      object,
      callback_url: callbackUrl,
      fields: fields.join(','),
      verify_token: verifyToken,
      include_values: 'true',
      access_token: appToken,
    });
    console.log(`${object}: ${result.success ? 'abonat' : 'fără confirmare'} (${fields.join(', ')})`);
  }

  const list = await graph<{ data?: { object?: string; callback_url?: string; active?: boolean; fields?: { name?: string }[] }[] }>(
    `${appId}/subscriptions`,
    'GET',
    { access_token: appToken }
  );
  for (const sub of list.data ?? []) {
    const names = (sub.fields ?? []).map((f) => f.name).join(', ');
    console.log(`Verificare: ${sub.object} → ${sub.callback_url} (${sub.active ? 'activ' : 'inactiv'}): ${names}`);
  }
}

main().catch((error: Error) => {
  console.error(`Eroare: ${error.message}`);
  process.exitCode = 1;
});
