import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Criptarea tokenilor OAuth salvați în baza de date (AES-256-GCM).
 * Cheia: SOCIAL_TOKEN_KEY = 32 de octeți în hex (64 caractere) sau base64.
 * Generare: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Formatul salvat: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. Prefixul de
 * versiune permite rotirea cheii mai târziu fără a rupe rândurile existente.
 */

const VERSION = 'v1';

function key(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_KEY?.trim();
  if (!raw) throw new Error('SOCIAL_TOKEN_KEY nu este setat');
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('SOCIAL_TOKEN_KEY trebuie să aibă 32 de octeți (64 caractere hex)');
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !data) throw new Error('Token criptat într-un format necunoscut');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}
