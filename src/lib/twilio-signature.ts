import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validarea semnăturii `X-Twilio-Signature`.
 * Algoritm Twilio: URL-ul complet al webhook-ului + perechile cheie/valoare
 * din body sortate alfabetic după cheie și concatenate, HMAC-SHA1 cu Auth
 * Token, codat base64.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function isValidTwilioSignature(input: {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  const payload = Object.keys(input.params)
    .sort()
    .reduce((acc, key) => acc + key + input.params[key], input.url);

  const expected = createHmac('sha1', input.authToken).update(Buffer.from(payload, 'utf-8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(input.signature);
  // timingSafeEqual aruncă dacă lungimile diferă — verificăm întâi.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Validarea e opt-in: se activează cu TWILIO_VALIDATE_SIGNATURE=true.
 * Motiv: în spatele unui proxy/tunel (ngrok, preview deployments) URL-ul văzut
 * de Next poate diferi de cel semnat de Twilio, iar webhook-ul ar pica silențios.
 */
export function signatureValidationEnabled(): boolean {
  return process.env.TWILIO_VALIDATE_SIGNATURE === 'true';
}

/**
 * URL-ul folosit la semnare. Twilio semnează exact adresa configurată în
 * consolă, deci în producție (proxy Vercel) trebuie reconstruită din
 * TWILIO_WEBHOOK_BASE_URL / NEXT_PUBLIC_APP_URL, nu din `req.url`.
 */
export function signedUrlFor(requestUrl: string): string {
  const base = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return requestUrl;

  const incoming = new URL(requestUrl);
  const rebuilt = new URL(incoming.pathname + incoming.search, base);
  return rebuilt.toString();
}
