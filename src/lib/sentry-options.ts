/**
 * Opțiunile Sentry comune pentru server și edge (sentry.*.config.ts). În browser
 * nu rulează intenționat: erorile care contează (API, cron-uri, outreach) sunt pe
 * server, iar SDK-ul de client ar îngreuna fiecare pagină.
 *
 * Fără DSN setat, Sentry nu trimite nimic. `release` = commit-ul (setat din CI,
 * cu fallback pe Vercel), ca fiecare eroare să arate deploy-ul care a produs-o.
 *
 * Date personale: CRM-ul lucrează cu emailuri și telefoane de lead-uri și clienți,
 * care pot ajunge în mesajele de eroare. `beforeSend` le maschează înainte să plece.
 */
import type { ErrorEvent } from '@sentry/nextjs';

const EMAIL_RE = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+?4?0|\+\d{1,3})[\s.-]?(?:\d[\s.-]?){8,11}\d/g;

const maskPII = (text: string) => text.replace(EMAIL_RE, '[email]').replace(PHONE_RE, '[telefon]');

function scrub(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = maskPII(event.message);
  event.exception?.values?.forEach(v => { if (v.value) v.value = maskPII(v.value); });
  event.breadcrumbs?.forEach(b => { if (b.message) b.message = maskPII(b.message); });
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = maskPII(event.request.query_string);
    }
  }
  delete event.user;
  return event;
}

export const sentryOptions = {
  dsn: process.env.SENTRY_DSN,
  environment: process.env.APP_ENV || process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.GIT_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: scrub,
};
