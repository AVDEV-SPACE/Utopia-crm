import type { SocialEvent } from './events';

/**
 * Procesarea evenimentelor sociale primite prin webhook. Deocamdată doar le
 * înregistrează în log; salvarea în conversații, legarea de lead și
 * auto-reply-ul vin odată cu tabelele din setup-db-socials.sql.
 */
export async function ingestSocialEvents(events: SocialEvent[]): Promise<void> {
  for (const event of events) {
    console.log(`[social] ${event.channel} ${event.kind} primit (${event.externalId})`);
  }
}
