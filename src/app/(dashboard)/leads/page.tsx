import { redirect } from 'next/navigation';

/**
 * /leads a fost unită cu /pipeline (o singură pagină pentru toate leadurile).
 * Linkurile vechi — /leads?lead=<id>, /leads?view=pitched — merg mai departe.
 */
export default function LeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/pipeline?${query}` : '/pipeline');
}
