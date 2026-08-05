import { PageSpeedResult } from './pagespeed';
import { SiteScanResult } from './site-scan';
import { ScoreDetails } from './types';

/**
 * Scor 0-100 = calitatea site-ului lor. Cu cât mai mic, cu atât mai mare
 * oportunitatea de vânzare (site slab → propunere Utopia mai convingătoare).
 */
export function computeScore(scan: SiteScanResult, pagespeed: PageSpeedResult): {
  score: number;
  score_details: ScoreDetails;
} {
  let score = 100;

  if (!scan.reachable) {
    score = 0;
  } else {
    if (!scan.hasHttps) score -= 25;
    if (!scan.hasMetaViewport) score -= 20;

    if (pagespeed.mobile !== null) {
      score -= Math.round((100 - pagespeed.mobile) * 0.3);
    } else {
      score -= 15;
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const score_details: ScoreDetails = {
    https: scan.hasHttps,
    has_ssl: scan.hasSsl,
    mobile_friendly: scan.hasMetaViewport,
    page_speed_mobile: pagespeed.mobile,
    page_speed_desktop: pagespeed.desktop,
    last_updated_estimate: scan.lastUpdatedEstimate,
    response_time_ms: scan.responseTimeMs,
    reachable: scan.reachable,
  };

  return { score, score_details };
}
