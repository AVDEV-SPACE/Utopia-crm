/**
 * Reutilizează flow-ul customAmount deja implementat în
 * UTOPIA-SITE/app/api/stripe/checkout/route.ts (folosit de pagina /facturare),
 * ca să nu duplicăm logica de creare a Checkout Session-ului Stripe aici.
 */
export async function createPaymentLink(params: {
  amountEur: number;
  label: string;
  clientEmail?: string | null;
}): Promise<string> {
  const baseUrl = process.env.UTOPIA_SITE_URL ?? 'https://utopia-systems.ro';

  const res = await fetch(`${baseUrl}/api/stripe/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customAmount: params.amountEur,
      customLabel: params.label,
      clientEmail: params.clientEmail ?? undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Eroare la crearea link-ului de plată (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { url?: string };
  if (!data.url) {
    throw new Error('Răspunsul Stripe checkout nu conține un URL');
  }

  return data.url;
}
