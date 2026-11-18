// Pornit o dată la startul serverului (Next 14 îl cere activat în
// next.config.js: experimental.instrumentationHook).
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('../sentry.server.config');
  if (process.env.NEXT_RUNTIME === 'edge') await import('../sentry.edge.config');
}

// Folosit de Next 15+; pe 14 e ignorat, erorile de server le prinde SDK-ul direct.
export const onRequestError = Sentry.captureRequestError;
