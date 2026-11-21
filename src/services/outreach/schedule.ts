import type { OutreachChannel } from './types';

/** Fusul orar după care se calculează ferestrele de trimitere și plafoanele. */
export const OUTREACH_TZ = 'Europe/Bucharest';

type Window = readonly [number, number];

/** Intervalele implicite de trimitere automată [început, sfârșit), ora României. */
const DEFAULT_WINDOWS = '08-10,18-22;10-15';

/**
 * Un set de intervale („08-10,18-22”) → [[8, 10], [18, 22]]. Orele sunt întregi
 * 0–24, începutul mai mic decât sfârșitul. `null` dacă ceva e invalid; un set
 * gol („” sau „-”) = nicio trimitere în acele zile.
 */
function parseWindowSet(raw: string): Window[] | null {
  const text = raw.trim();
  if (text === '' || text === '-') return [];
  const windows: Window[] = [];
  for (const part of text.split(',')) {
    const match = part.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (start < 0 || end > 24 || start >= end) return null;
    windows.push([start, end]);
  }
  return windows;
}

/**
 * Intervalele de trimitere din `OUTREACH_SEND_WINDOWS`: „luni-vineri;weekend”,
 * de exemplu `08-10,18-22;10-15`. O valoare invalidă (sau lipsă) → implicitul,
 * ca o greșeală de tastare să nu deschidă trimiterea toată ziua.
 */
export function sendWindows(): { weekday: Window[]; weekend: Window[] } {
  const parse = (raw: string) => {
    const [weekday, weekend, ...rest] = raw.split(';');
    if (rest.length > 0 || weekend === undefined) return null;
    const wd = parseWindowSet(weekday);
    const we = parseWindowSet(weekend);
    return wd && we ? { weekday: wd, weekend: we } : null;
  };
  const configured = process.env.OUTREACH_SEND_WINDOWS?.trim();
  const parsed = configured ? parse(configured) : null;
  if (configured && !parsed) console.warn(`OUTREACH_SEND_WINDOWS invalid („${configured}”), se folosesc intervalele implicite`);
  return parsed ?? parse(DEFAULT_WINDOWS)!;
}

const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const describe = (windows: Window[]) =>
  windows.length === 0 ? 'fără trimiteri' : windows.map(([s, e]) => `${pad(s)}–${pad(e)}`).join(' și ');

/** Intervalele, pe înțelesul utilizatorului (mesaje de stare și panoul de campanie). */
export function sendWindowsLabel(): string {
  const { weekday, weekend } = sendWindows();
  return `luni–vineri ${describe(weekday)}, weekend ${describe(weekend)}`;
}

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

/** Plafonul de email în primele săptămâni: volumul crește treptat, nu din prima zi. */
const EMAIL_RAMP = [10, 20, 30];
const WEEK_MS = 7 * 86_400_000;

/**
 * Plafonul zilnic de email, ținând cont de creșterea treptată. `firstSentAt` =
 * prima trimitere reală (`null` = nu a plecat încă niciuna, deci prima săptămână).
 * După creștere rămâne plafonul din env, care e oricum limita de sus.
 */
export function emailSendCap(firstSentAt: Date | null, now = new Date()): number {
  const cap = dailyCap('email');
  const week = firstSentAt ? Math.floor((now.getTime() - firstSentAt.getTime()) / WEEK_MS) : 0;
  return week < EMAIL_RAMP.length ? Math.min(cap, EMAIL_RAMP[week]) : cap;
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
  const all = sendWindows();
  const windows = weekday >= 6 ? all.weekend : all.weekday;
  if (!windows.some(([start, end]) => hour >= start && hour < end)) {
    return `în afara intervalelor ${sendWindowsLabel()} (${OUTREACH_TZ})`;
  }
  return null;
}

/**
 * Lista de test (`OUTREACH_ALLOWED_RECIPIENTS`): dacă e setată, doar aceste
 * adrese primesc emailuri și doar leadurile lor se planifică.
 */
export function allowedRecipients(): string[] {
  return (process.env.OUTREACH_ALLOWED_RECIPIENTS ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

/** Comutatorul general: fără `OUTREACH_SEND_ENABLED=true` nu pleacă niciun email. */
export function isSendingEnabled(): boolean {
  return process.env.OUTREACH_SEND_ENABLED === 'true';
}
