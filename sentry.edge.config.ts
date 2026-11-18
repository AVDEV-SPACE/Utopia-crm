// Sentry pe edge (middleware-ul Clerk) — încărcat din src/instrumentation.ts
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry-options';

Sentry.init(sentryOptions);
