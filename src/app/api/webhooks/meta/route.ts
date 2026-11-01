import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { safeEqual } from '@/lib/secret';
import { parseMetaWebhook, type MetaWebhookPayload } from '@/services/social/events';
import { ingestSocialEvents } from '@/services/social/inbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Webhook Meta (Facebook Page + Instagram Business): DM-uri și comentarii.
 * Rută publică în middleware; autentificarea e semnătura `X-Hub-Signature-256`
 * (HMAC-SHA256 cu META_APP_SECRET peste corpul brut).
 *
 * GET: verificarea abonării din App Dashboard (`hub.verify_token`).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const token = params.get('hub.verify_token') ?? '';

  if (params.get('hub.mode') === 'subscribe' && expected && safeEqual(token, expected)) {
    return new NextResponse(params.get('hub.challenge') ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

/** Semnătura Meta: `sha256=` + HMAC-SHA256(app secret, corp brut), comparată în timp constant. */
function validSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;
  return safeEqual(header, expected);
}

/**
 * Răspunde 200 imediat, procesarea continuă în fundal (`waitUntil`): Meta
 * reîncearcă un webhook care răspunde lent sau cu eroare. Erorile de
 * procesare se loghează, dar nu întorc 500 — la fel ca webhooks/unified.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!validSignature(raw, req.headers.get('x-hub-signature-256'))) {
    console.warn('[webhooks/meta] semnătură lipsă sau invalidă');
    return NextResponse.json({ error: 'Semnătură invalidă' }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(raw) as MetaWebhookPayload;
  } catch {
    console.warn('[webhooks/meta] corp JSON invalid');
    return NextResponse.json({ received: true });
  }

  const events = parseMetaWebhook(payload);
  if (events.length > 0) {
    waitUntil(
      ingestSocialEvents(events).catch((error) => {
        console.error('[webhooks/meta] procesarea a eșuat:', error);
      })
    );
  }
  return NextResponse.json({ received: true, events: events.length });
}
