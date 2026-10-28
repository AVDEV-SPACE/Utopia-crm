import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { checkCronSecret } from '@/lib/cron-auth';
import { runDiscover } from '@/services/engine/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel Hobby (Fluid compute): 300s maxim. Rularea își impune un buget mai mic.
export const maxDuration = 300;

/** Fereastra în care descoperirea rulează programat (ora României). */
const START_HOUR = 6;
const END_HOUR = 20;

function bucharestHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(now)
  );
}

/**
 * Descoperire programată: o pereche nișă × oraș pe rulare. Cere `Authorization: Bearer CRON_SECRET`.
 *
 * Răspunde imediat (202) și rulează în fundal cu `waitUntil`: o interogare
 * Overture durează 25–40s, iar cron-job.org închide cererea după 30s.
 * Rezultatul apare în „Ultimele rulări” din /pipeline (tabela engine_runs).
 */
export async function POST(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;

  // Programatorul extern poate întârzia; garda pe oră e aici, nu doar în cron
  const hour = bucharestHour();
  if (hour < START_HOUR || hour >= END_HOUR) {
    return NextResponse.json({ skipped: `în afara intervalului ${START_HOUR}:00–${END_HOUR}:00 (Europe/Bucharest)` });
  }

  waitUntil(
    runDiscover('cron').catch((error) => {
      console.error('Cron lead-discover eșuat:', error);
    })
  );
  return NextResponse.json({ started: true }, { status: 202 });
}
