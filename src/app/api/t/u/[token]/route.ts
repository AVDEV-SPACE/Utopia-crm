import { NextRequest } from 'next/server';
import { isTrackingToken, unsubscribe } from '@/services/outreach/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#fafaf9;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:440px;margin:64px auto;padding:32px 24px;background:#fff;border:1px solid #e7e5e4;border-radius:12px">
<h1 style="margin:0 0 12px;font-size:20px">${title}</h1>${body}</div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

const invalid = () =>
  page('Link invalid', '<p style="margin:0;color:#57534e">Linkul de dezabonare nu este valid sau a expirat.</p>', 404);

/**
 * Pagina de dezabonare. GET doar afișează confirmarea: scannerele de
 * securitate din căsuțele firmelor deschid automat linkurile din emailuri și
 * ar dezabona oameni care nu au cerut asta. Dezabonarea se face la POST
 * (butonul de mai jos sau one-click din Gmail, RFC 8058).
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!isTrackingToken(params.token)) return invalid();
  return page(
    'Dezabonare',
    `<p style="margin:0 0 20px;color:#57534e">Confirmați că nu mai doriți să primiți mesaje de la Utopia Systems.</p>
<form method="post"><button type="submit" style="background:#d97706;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;cursor:pointer">Confirm dezabonarea</button></form>`
  );
}

/** Tokenul e singura autorizare (rută publică). */
export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    if (!(await unsubscribe(params.token))) return invalid();
  } catch (error) {
    console.error('Dezabonare eșuată:', error);
    return page('Eroare', '<p style="margin:0;color:#57534e">Nu am putut procesa cererea. Încercați din nou peste câteva minute.</p>', 500);
  }
  return page('V-ați dezabonat', '<p style="margin:0;color:#57534e">Nu veți mai primi mesaje de la noi. Ne cerem scuze pentru deranj.</p>');
}
