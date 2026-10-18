import { Lead } from '@/services/leads/types';

/**
 * WhatsApp se trimite manual (se deschide wa.me pe numărul personal), deci
 * serverul nu află singur de trimitere — o înregistrăm din client, ca mesajul
 * să apară în jurnalul din „Mesaje & Mail-uri Trimise” / filtrul „Pitched”.
 *
 * Eșecul e ne-fatal: conversația WhatsApp e deja deschisă.
 */
export async function logWhatsAppSend(lead: Lead, body: string): Promise<void> {
  try {
    await fetch('/api/sent-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'whatsapp',
        recipient_type: 'lead',
        lead_id: lead.id,
        recipient_name: lead.company_name,
        recipient_email: lead.contact_email,
        recipient_phone: lead.contact_phone,
        subject: lead.pitch_subject,
        template_title: lead.pitch_generated ? 'Pitch personalizat' : null,
        body,
      }),
    });
  } catch (err) {
    console.error('Nu am putut jurnaliza mesajul WhatsApp:', err);
  }
}
