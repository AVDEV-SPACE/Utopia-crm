export interface PageSpeedResult {
  mobile: number | null;
  desktop: number | null;
}

async function fetchScore(url: string, strategy: 'mobile' | 'desktop', apiKey: string): Promise<number | null> {
  try {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', strategy);
    endpoint.searchParams.set('category', 'performance');
    endpoint.searchParams.set('key', apiKey);

    const res = await fetch(endpoint.toString());
    if (!res.ok) return null;

    const data = (await res.json()) as {
      lighthouseResult?: { categories?: { performance?: { score?: number } } };
    };
    const score = data.lighthouseResult?.categories?.performance?.score;
    return typeof score === 'number' ? Math.round(score * 100) : null;
  } catch {
    return null;
  }
}

export async function getPageSpeedScores(website: string): Promise<PageSpeedResult> {
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!apiKey) {
    return { mobile: null, desktop: null };
  }

  const [mobile, desktop] = await Promise.all([
    fetchScore(website, 'mobile', apiKey),
    fetchScore(website, 'desktop', apiKey),
  ]);

  return { mobile, desktop };
}
