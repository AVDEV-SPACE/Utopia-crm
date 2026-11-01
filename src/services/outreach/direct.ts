import { isEmailConfigured, isSmsConfigured, sendEmail, sendSMS } from '@/lib/messaging';
import { updateLead } from '@/services/leads/repository';
import type { Lead } from '@/services/leads/types';
import { logSentMessages } from '@/services/messages/repository';
import { logPipelineEvent } from '@/services/pipeline/repository';
import { CHANNEL_DELIVERY, CHANNEL_LABELS, channelTarget, leadContacts, type DirectChannel } from './channels';
import { composeManualEmail, senderFooter } from './email';
import { htmlToText, isHtmlContent } from './render';
import { stopSequence } from './repository';

/**
 * Trimiterea directă din fișa lead-ului (/pipeline, /leads), pe orice canal:
 * email și SMS pleacă din CRM; WhatsApp / Instagram / Facebook / LinkedIn se
 * trimit de utilizator (CRM-ul deschide conversația), iar aici se înregistrează.
 * Fiecare trimitere ajunge în „Mesaje trimise” (sent_messages), în istoricul
 * lead-ului (pipeline_events) și îl mută în etapa CONTACTED.
 */

/** Statusurile CRM care urcă la `sent` după o trimitere; cele mai avansate rămân. */
const UPGRADABLE_STATUSES = new Set(['new', 'scored', 'pitch_ready']);

export interface DirectSendInput {
  channel: DirectChannel;
  subject: string | null;
  body: string;
  /** Template-ul din care a pornit mesajul (pentru jurnal) */
  templateId: string | null;
  templateTitle: string | null;
}

export interface DirectSendResult {
  channel: DirectChannel;
  delivery: 'auto' | 'manual';
  /** Pași automați anulați (o trimitere manuală pe email preia secvența) */
  cancelledSteps: number;
}

export class DirectSendError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export async function sendDirect(lead: Lead, input: DirectSendInput, tenant: { orgId: string; userId: string }): Promise<DirectSendResult> {
  const target = channelTarget(input.channel, leadContacts(lead));
  if (!target) throw new DirectSendError(`Lead-ul nu are ${CHANNEL_LABELS[input.channel]} — completează contactul întâi`);

  const delivery = CHANNEL_DELIVERY[input.channel];
  const html = isHtmlContent(input.body);
  let messageId: string | null = null;
  let loggedBody = input.body;

  if (input.channel === 'email') {
    if (!isEmailConfigured()) throw new DirectSendError('Email neconfigurat: adaugă GMAIL_APP_PASSWORD', 503);
    const subject = input.subject?.trim();
    if (!subject) throw new DirectSendError('Emailul are nevoie de subiect');
    const email = composeManualEmail({ body: input.body, html, footer: senderFooter() });
    messageId = await sendEmail(target, subject, email.html, {
      text: email.text,
      fromName: process.env.OUTREACH_SENDER_NAME?.trim() || undefined,
    });
    loggedBody = email.html;
  } else if (input.channel === 'sms') {
    if (!isSmsConfigured()) throw new DirectSendError('SMS neconfigurat: adaugă TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER', 503);
    loggedBody = html ? htmlToText(input.body) : input.body.trim();
    await sendSMS(target, loggedBody);
  } else if (html) {
    // DM-urile sunt text: un template HTML se trimite ca text
    loggedBody = htmlToText(input.body);
  }

  const journal = () =>
    logSentMessages(tenant, [
      {
        channel: input.channel,
        recipient_type: 'lead',
        lead_id: lead.id,
        recipient_name: lead.company_name,
        recipient_email: lead.contact_email,
        recipient_phone: lead.contact_phone,
        template_id: input.templateId,
        template_title: input.templateTitle ?? 'Mesaj din fișa lead-ului',
        subject: input.channel === 'email' ? input.subject : null,
        body: loggedBody,
        message_id: messageId,
      },
    ]);

  // Pe un canal manual, înregistrarea ESTE acțiunea: dacă eșuează, utilizatorul trebuie să afle
  if (delivery === 'manual') {
    try {
      await journal();
    } catch (err) {
      if ((err as { code?: string }).code === '23514') {
        // check_violation: canalul nu e încă permis în sent_messages
        throw new DirectSendError('Canalul nu e încă activ în jurnal — rulează setup-db-outreach-channels.sql în Neon', 503);
      }
      throw err;
    }
  }

  // Un mesaj deja plecat (email, SMS) nu are voie să fie raportat ca eșec din cauza jurnalelor
  let cancelledSteps = 0;
  try {
    if (delivery === 'auto') await journal();
    await logPipelineEvent(
      {
        key: lead.source_ref,
        email: lead.contact_email,
        channel: input.channel,
        event: delivery === 'auto' ? `${input.channel}_sent` : `${input.channel}_sent_manual`,
        stage: 'CONTACTED',
        campaignId: 'manual',
        replyText: null,
        occurredAt: new Date(),
        payload: { templateId: input.templateId, messageId, by: tenant.userId },
      },
      lead.id
    );
    if (UPGRADABLE_STATUSES.has(lead.status)) await updateLead(lead.id, { status: 'sent' });
    // Un email trimis manual preia secvența automată: altfel pasul 1 ar pleca a doua oară
    if (input.channel === 'email') cancelledSteps = await stopSequence(lead.id, 'cancelled').catch(() => 0);
  } catch (err) {
    console.error('Trimitere directă: jurnalizarea a eșuat:', err);
  }

  return { channel: input.channel, delivery, cancelledSteps };
}
