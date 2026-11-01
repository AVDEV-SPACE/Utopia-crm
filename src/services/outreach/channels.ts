/**
 * Canalele pe care se poate contacta un lead din fișa lui (/pipeline, /leads).
 * Fără DB, deci se folosește și în browser.
 *
 * - `auto`: CRM-ul trimite (email prin Gmail, SMS prin Twilio);
 * - `manual`: platforma nu permite primul mesaj prin API (Instagram, Facebook,
 *   LinkedIn) sau trimiterea se face de pe telefon (WhatsApp, wa.me). CRM-ul
 *   deschide conversația cu textul pregătit, iar trimiterea se înregistrează.
 */

import type { Lead } from '@/services/leads/types';
import type { PipelineScoreDetails } from '@/services/pipeline/types';

export type DirectChannel = 'email' | 'sms' | 'whatsapp' | 'instagram' | 'facebook' | 'linkedin';

export const DIRECT_CHANNELS: readonly DirectChannel[] = ['email', 'sms', 'whatsapp', 'instagram', 'facebook', 'linkedin'];

export const CHANNEL_LABELS: Record<DirectChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

export const CHANNEL_DELIVERY: Record<DirectChannel, 'auto' | 'manual'> = {
  email: 'auto',
  sms: 'auto',
  whatsapp: 'manual',
  instagram: 'manual',
  facebook: 'manual',
  linkedin: 'manual',
};

/** Lungimea maximă a textului pe canal (DM-urile scurte au rată mai bună de răspuns). */
export const CHANNEL_MAX_CHARS: Record<DirectChannel, number> = {
  email: 20_000,
  sms: 640,
  whatsapp: 2_000,
  instagram: 1_000,
  facebook: 2_000,
  linkedin: 1_900,
};

/** Ce are nevoie de la lead fiecare canal. */
export interface ChannelContacts {
  email: string | null;
  phone: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
}

export function channelTarget(channel: DirectChannel, c: ChannelContacts): string | null {
  switch (channel) {
    case 'email':
      return c.email;
    case 'sms':
    case 'whatsapp':
      return c.phone;
    case 'instagram':
      return c.instagram;
    case 'facebook':
      return c.facebook;
    case 'linkedin':
      return c.linkedin;
  }
}

/** Linkurile importate pot veni fără schemă („instagram.com/x” sau doar „x”). */
export function profileUrl(value: string, base: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.includes('.')) return `${base}${value.replace(/^@/, '')}`;
  return `https://${value}`;
}

/** wa.me cere numărul internațional, fără „+” (07xx… → 407xx…). */
export function whatsAppUrl(phone: string, text: string): string {
  let digits = phone.replace(/[^\d]/g, '');
  if (digits.startsWith('07') && digits.length === 10) digits = `40${digits.slice(1)}`;
  else if (digits.startsWith('7') && digits.length === 9) digits = `40${digits}`;
  else if (digits.startsWith('0040')) digits = digits.slice(2);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Unde se deschide conversația pentru un canal manual. */
export function manualChannelUrl(channel: DirectChannel, c: ChannelContacts, text: string): string | null {
  switch (channel) {
    case 'whatsapp':
      return c.phone ? whatsAppUrl(c.phone, text) : null;
    case 'instagram':
      return c.instagram ? profileUrl(c.instagram, 'https://instagram.com/') : null;
    case 'facebook':
      return c.facebook ? profileUrl(c.facebook, 'https://facebook.com/') : null;
    case 'linkedin':
      return c.linkedin ? profileUrl(c.linkedin, 'https://www.linkedin.com/in/') : null;
    default:
      return null;
  }
}

/** Contactele unui lead pe canale: câmpurile lead-ului, completate din ce a găsit motorul (site, OSM, Overture). */
export function leadContacts(lead: Lead): ChannelContacts {
  const details = (lead.score_details ?? null) as unknown as Partial<PipelineScoreDetails> | null;
  return {
    email: lead.contact_email,
    phone: lead.contact_phone,
    instagram: lead.contact_instagram ?? details?.social?.instagram ?? null,
    facebook: details?.social?.facebook ?? details?.discovery?.facebook ?? null,
    linkedin: details?.social?.linkedin ?? details?.discovery?.linkedin ?? null,
  };
}
