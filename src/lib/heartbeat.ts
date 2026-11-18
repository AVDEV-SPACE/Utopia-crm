/**
 * Heartbeat-uri pentru joburile programate: la finalul fiecărei rulări, jobul
 * anunță monitorul (Better Stack). Dacă un job nu mai rulează deloc, monitorul
 * observă lipsa ping-ului și alertează — lucru pe care un cron nu îl poate
 * raporta despre el însuși.
 *
 * URL-ul vine din env: `HEARTBEAT_<NUME>` (ex. `llm-health` → `HEARTBEAT_LLM_HEALTH`).
 * Fără variabilă setată, ping-ul e sărit. `ok = false` trimite la `<url>/fail`,
 * ca monitorul să alerteze imediat, nu abia la expirarea intervalului.
 *
 * Fișierul e identic în UTOPIA-SITE și Utopia-crm, până la un pachet comun.
 */
export async function pingHeartbeat(name: string, ok = true): Promise<void> {
  const envName = `HEARTBEAT_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  const url = process.env[envName];
  if (!url) return;
  try {
    await fetch(ok ? url : `${url.replace(/\/+$/, '')}/fail`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
  } catch (err: any) {
    console.error(`[HEARTBEAT] ${envName}:`, err?.message || err);
  }
}
