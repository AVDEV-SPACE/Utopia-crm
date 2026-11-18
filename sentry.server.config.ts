// Sentry pe server (rute API, server components) — încărcat din src/instrumentation.ts
import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry-options';

Sentry.init(sentryOptions);
