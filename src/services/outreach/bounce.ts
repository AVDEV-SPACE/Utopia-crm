/**
 * Citirea unui raport de nelivrare (DSN, RFC 3464) din sursa brută a emailului.
 * Modul pur: primește textul, nu atinge rețeaua sau baza de date.
 */

export interface Bounce {
  /** Adresa la care emailul nu a ajuns, cu litere mici */
  recipient: string;
  /** Codul de stare, ex. `5.1.1`; `null` dacă raportul nu îl dă */
  status: string | null;
  reason: string;
}

const cleanAddress = (value: string) => value.trim().replace(/^<|>$/g, '').toLowerCase();

function reasonFor(status: string | null): string {
  if (status?.startsWith('5.1.')) return 'adresa nu există';
  if (status?.startsWith('5.2.')) return 'căsuța destinatarului nu poate primi mesaje';
  if (status?.startsWith('5.7.')) return 'blocat de serverul destinatarului (politică sau spam)';
  if (status?.startsWith('4.')) return 'serverul destinatarului nu a răspuns la timp';
  return 'respins de serverul destinatarului';
}

/**
 * `null` pentru orice nu e un eșec clar: o amânare (`Action: delayed`) sau un
 * email fără câmpuri de raport nu trebuie să oprească secvența unui lead.
 */
export function parseBounce(source: string): Bounce | null {
  const action = source.match(/^Action:\s*(\w+)/im)?.[1].toLowerCase() ?? null;
  const status = source.match(/^Status:\s*(\d\.\d{1,3}\.\d{1,3})/im)?.[1] ?? null;
  if (action !== 'failed' && !(action === null && status?.startsWith('5.'))) return null;

  const address =
    source.match(/^X-Failed-Recipients:\s*(\S+@[^\s,]+)/im)?.[1] ??
    source.match(/^Final-Recipient:\s*rfc822;\s*(\S+@\S+)/im)?.[1] ??
    source.match(/^Original-Recipient:\s*rfc822;\s*(\S+@\S+)/im)?.[1];
  if (!address) return null;

  return { recipient: cleanAddress(address), status, reason: reasonFor(status) };
}
