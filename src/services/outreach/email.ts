/**
 * Compunerea unui email de outreach, din text simplu (pitch AI, template de
 * text) sau dintr-un template HTML. În ambele cazuri se adaugă semnătura PFA,
 * linkul de dezabonare și pixelul de deschidere, plus o variantă text.
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

/** Semnătura din env; `\n` literal (Vercel nu păstrează mereu liniile noi) devine rând nou. */
export function senderFooter(): string | null {
  const footer = process.env.OUTREACH_SENDER_FOOTER?.replace(/\\n/g, '\n').trim();
  return footer || null;
}

/** Baza URL-urilor de tracking: domeniul public al aplicației. */
export function trackingBaseUrl(requestOrigin: string): string {
  return (process.env.NEXT_PUBLIC_APP_URL || requestOrigin).replace(/\/+$/, '');
}

export { htmlToText };

/**
 * Corpul HTML + semnătura, fără tracking (trimiterile manuale din fișa
 * lead-ului: nu au token de dezabonare/pixel, care țin de secvența automată).
 */
export function composeManualEmail(input: { body: string; html: boolean; footer: string | null }): { html: string; text: string } {
  const footerHtml = input.footer ? escapeHtml(input.footer).replace(/\n/g, '<br>') : null;
  const signature = footerHtml
    ? `<p style="margin:16px 0 0;color:#57534e;font-family:Arial,Helvetica,sans-serif;font-size:14px">--<br>${footerHtml}</p>`
    : '';

  if (input.html) {
    const html = /<\/body>/i.test(input.body) ? input.body.replace(/<\/body>/i, `${signature}</body>`) : `${input.body}${signature}`;
    return { html, text: [htmlToText(input.body), input.footer ? `\n--\n${input.footer}` : ''].join('') };
  }
  const paragraphs = input.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return {
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1c1917">${paragraphs}${signature}</div>`,
    text: [input.body.trim(), input.footer ? `\n--\n${input.footer}` : ''].join(''),
  };
}

export function composeOutreachEmail(input: {
  /** Corpul: text simplu, sau HTML când `html` e true */
  body: string;
  html: boolean;
  footer: string;
  token: string;
  baseUrl: string;
}): ComposedEmail {
  const unsubscribeUrl = `${input.baseUrl}/api/t/u/${input.token}`;
  const pixelUrl = `${input.baseUrl}/api/t/o/${input.token}`;
  const footerHtml = escapeHtml(input.footer).replace(/\n/g, '<br>');

  const signature = `<p style="margin:16px 0 0;color:#57534e;font-family:Arial,Helvetica,sans-serif;font-size:14px">--<br>${footerHtml}</p><p style="margin:16px 0 0;font-size:12px;color:#a8a29e;font-family:Arial,Helvetica,sans-serif">Dacă nu doriți să mai primiți mesaje de la noi, <a href="${escapeHtml(unsubscribeUrl)}" style="color:#a8a29e">dezabonați-vă aici</a>.</p><img src="${escapeHtml(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;

  let html: string;
  let bodyText: string;
  if (input.html) {
    // Semnătura intră în corpul documentului, înainte de </body>, dacă există
    html = /<\/body>/i.test(input.body) ? input.body.replace(/<\/body>/i, `${signature}</body>`) : `${input.body}${signature}`;
    bodyText = htmlToText(input.body);
  } else {
    const paragraphs = input.body
      .trim()
      .split(/\n{2,}/)
      .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
    html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1c1917">${paragraphs}${signature}</div>`;
    bodyText = input.body.trim();
  }

  const text = [bodyText, '', '--', input.footer, '', `Dacă nu doriți să mai primiți mesaje de la noi: ${unsubscribeUrl}`].join('\n');

  return {
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
