import { NextRequest } from 'next/server';
import { recordOpen } from '@/services/outreach/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GIF transparent 1×1. */
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/**
 * Pixelul de deschidere din emailurile de outreach. Rută publică: tokenul
 * (aleator, 48 hex) e singura autorizare. Răspunde mereu cu pixelul, chiar
 * și pentru tokenuri necunoscute, ca să nu confirme ce tokenuri există.
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    await recordOpen(params.token);
  } catch (error) {
    console.error('Tracking deschidere eșuat:', error);
  }
  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(PIXEL.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
