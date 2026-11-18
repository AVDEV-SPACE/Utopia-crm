/**
 * Health-check-uri pentru monitorizarea externă (Better Stack acum; load balancer,
 * Kubernetes/Cloud Run și smoke test-ul din CI/CD mai târziu).
 *
 *   /api/health/live         procesul răspunde — fără dependențe
 *   /api/health/ready        dependențele critice (DB) — public, ieftin, la câteva minute
 *   /api/health/ready?deep=1 toate dependențele — cere `Authorization: Bearer HEALTH_TOKEN`
 *
 * Formatul urmează draftul IETF „Health Check Response Format for HTTP APIs":
 * `status` pass | warn | fail, HTTP 503 doar la `fail`. O verificare necritică
 * picată dă `warn` (200) — monitorul complet caută `"status":"pass"` în răspuns,
 * deci alertează și atunci. Fără date personale în răspuns.
 *
 * Fișierul e identic în UTOPIA-SITE și Utopia-crm, până la un pachet comun.
 */
import { timingSafeEqual } from 'crypto';

export type HealthStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheck {
  /** `fail` aici face tot serviciul `fail` (503). */
  critical: boolean;
  timeoutMs?: number;
  /** Aruncă la problemă; poate întoarce un detaliu scurt (ex. „2 provideri"). */
  run(): Promise<string | void>;
}

interface CheckResult {
  status: HealthStatus;
  critical: boolean;
  durationMs: number;
  output?: string;
}

const DEFAULT_TIMEOUT_MS = 4_000;

export function appVersion(service: string) {
  return {
    service: process.env.APP_NAME || service,
    environment: process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    // Setat din CI la build; pe Vercel există implicit
    release: (process.env.GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 12),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout după ${ms}ms`)), ms)),
  ]);
}

async function runOne(check: HealthCheck): Promise<CheckResult> {
  const started = Date.now();
  try {
    const output = await withTimeout(check.run(), check.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return { status: 'pass', critical: check.critical, durationMs: Date.now() - started, ...(output && { output }) };
  } catch (err: any) {
    return {
      status: check.critical ? 'fail' : 'warn',
      critical: check.critical,
      durationMs: Date.now() - started,
      // Doar mesajul, scurtat: fără stack-uri sau conexiuni în răspunsul public
      output: String(err?.message || err).slice(0, 200),
    };
  }
}

/** Rulează verificările în paralel și construiește răspunsul HTTP. */
export async function healthResponse(service: string, checks: Record<string, HealthCheck>): Promise<Response> {
  const names = Object.keys(checks);
  const results = await Promise.all(names.map(name => runOne(checks[name])));
  const byName = Object.fromEntries(names.map((name, i) => [name, results[i]]));

  const status: HealthStatus = results.some(r => r.status === 'fail') ? 'fail'
    : results.some(r => r.status === 'warn') ? 'warn' : 'pass';

  return Response.json(
    { status, ...appVersion(service), checkedAt: new Date().toISOString(), checks: byName },
    { status: status === 'fail' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** `Authorization: Bearer <HEALTH_TOKEN>`, comparat în timp constant. Fără token setat → refuz. */
export function isHealthAuthorized(request: Request): boolean {
  const expected = process.env.HEALTH_TOKEN;
  if (!expected) return false;
  const provided = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
