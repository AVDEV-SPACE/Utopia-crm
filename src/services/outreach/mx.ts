import { Resolver } from 'node:dns/promises';

/** Răspunsuri DNS care spun clar că domeniul nu are unde primi email. */
const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA']);

/**
 * Verifică dacă domeniul adresei are servere de email (MX). Un domeniu fără MX
 * sau cu „null MX” (RFC 7505) înseamnă o respingere sigură. Domeniile care
 * primesc email direct pe înregistrarea A sunt rare, așa că le tratăm la fel:
 * pierdem cel mult un lead, nu punem o respingere pe reputația căsuței.
 *
 * O eroare temporară de DNS nu oprește trimiterea: nu dovedește nimic despre adresă.
 */
export async function canReceiveEmail(address: string): Promise<boolean> {
  const domain = address.split('@')[1]?.trim().toLowerCase();
  if (!domain) return false;

  try {
    const records = await new Resolver({ timeout: 3_000, tries: 2 }).resolveMx(domain);
    return records.some((record) => record.exchange && record.exchange !== '.');
  } catch (err) {
    return !NO_MAIL_CODES.has((err as { code?: string }).code ?? '');
  }
}
