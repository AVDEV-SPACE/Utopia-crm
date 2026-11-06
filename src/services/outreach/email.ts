/**
 * Compunerea unui email de outreach, din text simplu (pitch AI, template de
 * text) sau dintr-un template HTML. În ambele cazuri se adaugă linkul de
 * dezabonare, plus o variantă text. Fără pixel de deschidere: ruta lui rămâne
 * doar pentru emailurile trimise deja.
 */
import { htmlToText } from './render';

export interface ComposedEmail {
  text: string;
  html: string;
  /** Headerele de dezabonare one-click (RFC 8058), recomandate de Gmail */
  headers: Record<string, string>;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Baza URL-urilor de tracking: domeniul public al aplicației. */
export function trackingBaseUrl(requestOrigin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || requestOrigin).replace(/\/+$/, '');
}

export { htmlToText };

const textToHtml = (body: string, extra = '') => {
  const paragraphs = body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1c1917">${paragraphs}${extra}</div>`;
};

/**
 * Corpul email-ului, fără tracking (trimiterile manuale din fișa lead-ului: nu
 * au token de dezabonare/pixel, care țin de secvența automată).
 */
export function composeManualEmail(input: { body: string; html: boolean }): { html: string; text: string } {
  if (input.html) return { html: input.body, text: htmlToText(input.body) };
  return { html: textToHtml(input.body), text: input.body.trim() };
}

export function composeOutreachEmail(input: {
  /** Corpul: text simplu, sau HTML când `html` e true */
  body: string;
  html: boolean;
  token: string;
  baseUrl: string;
}): ComposedEmail {
  const unsubscribeUrl = `${input.baseUrl}/api/t/u/${input.token}`;

  const tracking = `<p style="margin:16px 0 0;font-size:12px;color:#a8a29e;font-family:Arial,Helvetica,sans-serif">Dacă nu doriți să mai primiți mesaje de la noi, <a href="${escapeHtml(unsubscribeUrl)}" style="color:#a8a29e">dezabonați-vă aici</a>.</p>`;

  let html: string;
  let bodyText: string;
  if (input.html) {
    // Blocul intră în corpul documentului, înainte de </body>, dacă există
    html = /<\/body>/i.test(input.body) ? input.body.replace(/<\/body>/i, `${tracking}</body>`) : `${input.body}${tracking}`;
    bodyText = htmlToText(input.body);
  } else {
    html = textToHtml(input.body, tracking);
    bodyText = input.body.trim();
  }

  return {
    text: [bodyText, '', `Dacă nu doriți să mai primiți mesaje de la noi: ${unsubscribeUrl}`].join('\n'),
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
