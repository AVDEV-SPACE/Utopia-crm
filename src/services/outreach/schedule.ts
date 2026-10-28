import type { OutreachChannel } from './types';

/** Fusul orar după care se calculează ferestrele de trimitere și plafoanele. */
export const OUTREACH_TZ = 'Europe/Bucharest';

/** Trimiterea automată: luni–vineri, 09:00–17:00 ora României. */
export const SEND_START_HOUR = 9;
export const SEND_END_HOUR = 17;

/**
 * Bugetul unei rulări în fundal (planificare, inbox). Rutele cron răspund
 * imediat și continuă cu `waitUntil`, pentru că cron-job.org închide cererea
 * după 30s; limita reală e maxDuration (300s pe Vercel Hobby cu Fluid compute).
 */
export const BACKGROUND_BUDGET_MS = 240_000;

/** Zilele pașilor, relativ la trimiterea pasului 1 (ziua 1 = ziua trimiterii). */
export const STEP_OFFSET_DAYS: Record<number, number> = { 1: 0, 2: 3, 3: 8 };

/** Începutul zilei curente în ora României, ca expresie SQL. */
export const TODAY_START_SQL = `(date_trunc('day', now() AT TIME ZONE '${OUTREACH_TZ}') AT TIME ZONE '${OUTREACH_TZ}')`;

const DEFAULT_CAPS: Record<OutreachChannel, number> = { email: 40, instagram: 35, linkedin: 25 };
const CAP_ENV: Record<OutreachChannel, string> = {
  email: 'OUTREACH_EMAIL_DAILY_CAP',
  instagram: 'OUTREACH_IG_DAILY_CAP',
  linkedin: 'OUTREACH_LINKEDIN_DAILY_CAP',
};

/** Plafonul zilnic pe canal, din env (valoare invalidă → implicitul). */
export function dailyCap(channel: OutreachChannel): number {
  const raw = Number(process.env[CAP_ENV[channel]]);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_CAPS[channel];
}

/** Ziua săptămânii (1 = luni … 7 = duminică) și ora, în ora României. */
export function bucharestClock(now = new Date()): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: OUTREACH_TZ,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const weekdayName = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekdayName) + 1;
  return { weekday, hour };
}

/** `null` dacă acum se poate trimite, altfel motivul. */
export function sendWindowBlock(now = new Date()): string | null {
  const { weekday, hour } = bucharestClock(now);
  if (weekday === 6 || weekday === 7) return 'weekend — trimiterea rulează doar luni–vineri';
  if (hour < SEND_START_HOUR || hour >= SEND_END_HOUR) {
    return `în afara intervalului ${SEND_START_HOUR}:00–${SEND_END_HOUR}:00 (${OUTREACH_TZ})`;
  }
  return null;
}

/** Comutatorul general: fără `OUTREACH_SEND_ENABLED=true` nu pleacă niciun email. */
export function isSendingEnabled(): boolean {
  return process.env.OUTREACH_SEND_ENABLED === 'true';
}
