import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/secret';

/**
 * Autentificarea rutelor /api/cron/*. Sunt publice în middleware (programatorul
 * nu are sesiune Clerk), deci fiecare handler o apelează înainte de orice.
 *
 * Cere `Authorization: Bearer <CRON_SECRET>`. Întoarce `null` dacă cererea e
 * autorizată, altfel răspunsul de eroare gata de returnat.
 */
export function checkCronSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('Cron: CRON_SECRET nu este setat');
    return NextResponse.json({ error: 'Cron-ul nu este configurat pe server' }, { status: 500 });
  }

  const provided = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? '';
  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Neautorizat' }, { status: 401 });
  }
  return null;
}
