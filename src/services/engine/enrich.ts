import type { Lead } from '@/services/leads/types';
import type { EngineDiscovery, PipelineScoreDetails } from '@/services/pipeline/types';
import { fetchPage, type FetchedPage } from './http';
import { isMetaAdLibraryEnabled } from './meta-adlib';
import { isSocialUrl } from './normalize';
import { auditIssues, extractSiteFacts, MIN_HTML_LENGTH, type SiteFacts } from './signals';
import { scoreLead, type LeadPitch, type ScoreFacts } from './score';
import type { EnrichmentUpdate } from './repository';

/** Paginile încercate după homepage, când acesta nu are email. */
const CONTACT_PATHS = ['/contact', '/contact.html'];

export interface SiteSnapshot {
  facts: SiteFacts;
  /** Paginile descărcate, pentru diagnostic */
  pages: Array<{ url: string; status: number | null; error?: string }>;
}

/** Descarcă homepage-ul (+ paginile de contact dacă lipsește emailul) și extrage faptele. */
export async function snapshotSite(website: string | null): Promise<SiteSnapshot> {
  const empty = extractSiteFacts('', null);
  if (!website || isSocialUrl(website)) return { facts: empty, pages: [] };

  const home = await fetchPage(website);
  const pages: SiteSnapshot['pages'] = [{ url: home.url, status: home.status, error: home.error }];
  const loaded = home.ok && home.html.length > MIN_HTML_LENGTH;
  if (!loaded) return { facts: extractSiteFacts('', home.url.startsWith('https://') ? home.url : null), pages };

  const facts = extractSiteFacts(home.html, home.url);

  if (facts.emails.length === 0) {
    for (const path of CONTACT_PATHS) {
      const contact: FetchedPage = await fetchPage(new URL(path, home.url).toString());
      pages.push({ url: contact.url, status: contact.status, error: contact.error });
      if (!contact.ok) continue;
      const extra = extractSiteFacts(contact.html, contact.url);
      facts.emails = extra.emails;
      facts.instagram ??= extra.instagram;
      facts.facebook ??= extra.facebook;
      facts.linkedin ??= extra.linkedin;
      if (facts.emails.length > 0) break;
    }
  }
  return { facts, pages };
}

function discoveryOf(lead: Lead): EngineDiscovery | null {
  const details = lead.score_details as unknown as Partial<PipelineScoreDetails> | null;
  return details && typeof details === 'object' ? details.discovery ?? null : null;
}

/**
 * Îmbogățirea completă a unui lead: fapte de pe site → ICP → (dacă are contact)
 * scor + pitch cu Groq → etapă. Erorile de AI nu se aruncă: devin AI_ERROR.
 * `GroqRateLimitError` se propagă, ca rularea să se oprească fără să consume
 * încercări.
 */
export async function enrichLead(
  lead: Lead,
  snapshot: SiteSnapshot,
  options: { minScore: number; deadline: number }
): Promise<EnrichmentUpdate & { aiError?: string }> {
  const discovery = discoveryOf(lead);
  const { facts } = snapshot;
  const s = facts.signals;

  const instagram = lead.contact_instagram ?? facts.instagram ?? discovery?.instagram ?? null;
  const facebook = facts.facebook ?? discovery?.facebook ?? null;
  const linkedin = facts.linkedin ?? discovery?.linkedin ?? null;
  const email = lead.contact_email ?? facts.emails[0] ?? null;

  const hasActiveMetaAds = Boolean(discovery?.hasActiveMetaAds);
  const investsInMarketing = s.metaPixel || s.googleAds || hasActiveMetaAds;
  const activeOnSocial = Boolean(instagram || facebook);
  const icpMatch = investsInMarketing || activeOnSocial;
  const segment: 'A' | 'B' = investsInMarketing ? 'A' : 'B';
  const issues = auditIssues(s);

  const details: PipelineScoreDetails = {
    reason: null,
    segment,
    icpMatch,
    signals: {
      ...s,
      icpMatch,
      activeOnSocial,
      hasActiveMetaAds,
      investsInMarketing,
    },
    audit: { issues },
    social: { instagram, facebook, linkedin },
    linkedinDm: null,
    instagramDm: null,
    emailSource: lead.contact_email ? discovery?.source ?? 'sursă' : facts.emails[0] ? 'site' : null,
    source: discovery?.source ?? lead.source,
    firstLine: null,
    discovery,
  };

  const base = { email, instagram, details, segment, icpMatch } as const;

  // Fără niciun canal de contact nu cheltuim tokeni pe un pitch care nu poate pleca
  if (!email && !instagram && !lead.contact_phone) {
    return { ...base, stage: 'DISQUALIFIED_NO_CONTACT', score: null, pitchSubject: null, pitchBody: null, aiFailed: false };
  }

  const scoreFacts: ScoreFacts = {
    firma: lead.company_name,
    nisa: lead.niche,
    oras: lead.location,
    segment,
    icp_match: icpMatch,
    site_incarcat: s.siteLoaded,
    semnale: s.siteLoaded
      ? {
          pixel_meta: s.metaPixel,
          google_ads: s.googleAds,
          analytics: s.gtag,
          programari_online: s.booking,
          chat: s.chat,
          adaptat_mobil: s.viewport,
          https: s.https,
          an_copyright: s.copyrightYear,
        }
      : {},
    probleme_audit: issues,
    social: { instagram: Boolean(instagram), facebook: Boolean(facebook), linkedin: Boolean(linkedin) },
    // Fără Ad Library, „fără reclame” nu e un fapt: trimitem necunoscut, nu false
    reclame_meta_active: hasActiveMetaAds ? true : isMetaAdLibraryEnabled() ? false : null,
  };

  let pitch: LeadPitch;
  try {
    pitch = await scoreLead(scoreFacts, options.deadline);
  } catch (err) {
    if ((err as Error).name === 'GroqRateLimitError') throw err;
    return {
      ...base,
      stage: 'AI_ERROR',
      score: null,
      pitchSubject: null,
      pitchBody: null,
      aiFailed: true,
      aiError: (err as Error).message,
    };
  }

  details.reason = pitch.score_reason;
  details.firstLine = pitch.first_line;
  details.linkedinDm = pitch.linkedin_dm;
  details.instagramDm = pitch.instagram_dm;

  const stage =
    pitch.icp_score < options.minScore
      ? 'DISQUALIFIED'
      : email
        ? 'QUEUED_EMAIL'
        : instagram || lead.contact_phone
          ? 'QUEUED_MANUAL'
          : 'DISQUALIFIED_NO_CONTACT';

  return {
    ...base,
    stage,
    score: pitch.icp_score,
    pitchSubject: pitch.subject,
    pitchBody: pitch.email_body,
    aiFailed: false,
  };
}
