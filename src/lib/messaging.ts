import nodemailer from 'nodemailer';
import { UTOPIA_LOGO_CID, UTOPIA_LOGO_PNG_BASE64 } from './email-logo';

// ── Email ──────────────────────────────────────────────────────────────────
// GMAIL_USER = contul care a generat parola de aplicație (auth)
// EMAIL_FROM_ADDRESS = adresa afișată în câmpul "De la:"
const createTransporter = () =>
  nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: mailboxCredentials(),
  });

const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || process.env.GMAIL_USER || 'avdev.space@gmail.com';

/** Contul Gmail în care stau emailurile trimise și răspunsurile (auth SMTP/IMAP). */
export function mailboxCredentials(): { user: string; pass: string | undefined } {
  return {
    user: process.env.GMAIL_USER || process.env.EMAIL_FROM_ADDRESS || 'avdev.space@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS,
  };
}

/**
 * Link care deschide în Gmail exact mesajul cu acest Message-ID, în contul
 * căsuței CRM-ului (`authuser`), indiferent de ordinea conturilor din browser.
 */
export function gmailMessageUrl(messageId: string): string {
  const id = messageId.trim().replace(/^<|>$/g, '');
  return gmailSearchUrl(`rfc822msgid:${id}`);
}

/** Căutare Gmail — pentru trimiterile vechi, salvate fără Message-ID. */
export function gmailSearchUrl(query: string): string {
  const authuser = encodeURIComponent(mailboxCredentials().user);
  return `https://mail.google.com/mail/?authuser=${authuser}#search/${encodeURIComponent(query)}`;
}

/** Trimite emailul și întoarce Message-ID-ul lui (cu `<>`), pentru jurnal. */
export async function sendEmail(to: string, subject: string, html: string): Promise<string> {
  const transporter = createTransporter();
  try {
    await transporter.verify();
  } catch (err: unknown) {
    throw new Error(`Eroare conexiune SMTP: ${err instanceof Error ? err.message : String(err)}`);
  }
  const usesLogo = html.includes(`cid:${UTOPIA_LOGO_CID}`);
  const info = await transporter.sendMail({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    attachments: usesLogo
      ? [{
          filename: 'utopia-logo.png',
          content: Buffer.from(UTOPIA_LOGO_PNG_BASE64, 'base64'),
          cid: UTOPIA_LOGO_CID,
          contentType: 'image/png',
        }]
      : [],
  });
  console.log(`✅ Email trimis → ${to}`);
  return info.messageId;
}

// ── SMS via Twilio REST (fără pachet npm) ──────────────────────────────────
export async function sendSMS(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_PHONE_NUMBER!;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(`Twilio ${res.status}: ${err.message || JSON.stringify(err)}`);
  }
  console.log(`✅ SMS trimis → ${to}`);
}

// ── WhatsApp via Twilio REST (același endpoint ca SMS, prefix `whatsapp:`) ──
// `to` poate veni deja prefixat (așa îl trimite Twilio în webhook) sau curat.
export async function sendWhatsApp(to: string, body: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_WHATSAPP_NUMBER!;

  const withPrefix = (n: string) => (n.startsWith('whatsapp:') ? n : `whatsapp:${n}`);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: withPrefix(to),
      From: withPrefix(from),
      Body: body,
    }).toString(),
  });

  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) {
    throw new Error(`Twilio WhatsApp ${res.status}: ${data.message || JSON.stringify(data)}`);
  }
  console.log(`✅ WhatsApp trimis → ${to}`);
  return data.sid ?? '';
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_NUMBER
  );
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS);
}

export function isSmsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}
