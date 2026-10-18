import { isSmsConfigured, isWhatsAppConfigured } from '@/lib/messaging';
import { isGroqConfigured } from './ai';
import { OrganizationSettings } from './types';

/** Payload-ul consumat de /dashboard/follow-ups-ai. */
export interface FollowUpSettingsResponse {
  settings: OrganizationSettings;
  /** URL-ul de pus în Twilio Console (Voice + Messaging webhooks) */
  webhookUrl: string;
  /** Endpoint-ul unde site-ul trimite lead-uri */
  leadsEndpoint: string;
  /** Ce integrări sunt configurate în environment — afișate ca status în UI */
  integrations: {
    sms: boolean;
    whatsapp: boolean;
    groq: boolean;
  };
}

function appBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'https://utopia-crm.com';
  return base.replace(/\/+$/, '');
}

export function buildSettingsResponse(settings: OrganizationSettings): FollowUpSettingsResponse {
  const base = appBaseUrl();
  return {
    settings,
    webhookUrl: `${base}/api/webhooks/unified?orgId=${encodeURIComponent(settings.org_id)}`,
    leadsEndpoint: `${base}/api/leads`,
    integrations: {
      sms: isSmsConfigured(),
      whatsapp: isWhatsAppConfigured(),
      groq: isGroqConfigured(),
    },
  };
}
