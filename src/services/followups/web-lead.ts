import { isSmsConfigured, sendSMS } from '@/lib/messaging';
import { createAutomationLead } from '@/services/leads/repository';
import { Lead } from '@/services/leads/types';
import { OrganizationSettings } from './types';

export interface WebLeadInput {
  name: string;
  phone: string;
  serviceDesired?: string | null;
  email?: string | null;
  /** Referință externă (ex. bookingId din site) pentru idempotență */
  sourceRef?: string | null;
}

export interface WebLeadResult {
  lead: Lead | null;
  /** false când lead-ul exista deja (același sourceRef) sau SMS-ul e oprit */
  smsSent: boolean;
  /** Motivul pentru care nu s-a trimis SMS — util la debug din site */
  smsSkippedReason?: string;
}

/**
 * Lead venit dintr-un formular de pe site (agentie-digitala) + automatizarea
 * configurată în /dashboard/follow-ups-ai.
 *
 * SMS-ul de confirmare e controlat de același toggle ca SMS-ul de apel pierdut
 * („Follow-up prin SMS"), iar textul e cel configurat acolo — un singur
 * comutator pentru tot follow-up-ul prin SMS al organizației.
 */
export async function processWebLead(
  settings: OrganizationSettings,
  input: WebLeadInput
): Promise<WebLeadResult> {
  const lead = await createAutomationLead({
    org_id: settings.org_id,
    company_name: input.name,
    contact_phone: input.phone,
    contact_email: input.email ?? null,
    service_desired: input.serviceDesired ?? null,
    status: 'WEB_FORM',
    source: 'website',
    source_ref: input.sourceRef ?? null,
    notes: input.serviceDesired ? `Serviciu solicitat: ${input.serviceDesired}` : null,
  });

  if (!lead) {
    return { lead: null, smsSent: false, smsSkippedReason: 'lead deja înregistrat' };
  }

  if (!settings.missed_call_sms_enabled) {
    return { lead, smsSent: false, smsSkippedReason: 'follow-up SMS dezactivat' };
  }
  if (!isSmsConfigured()) {
    return { lead, smsSent: false, smsSkippedReason: 'Twilio SMS neconfigurat' };
  }

  const body = settings.missed_call_sms_message.trim();
  if (!body) {
    return { lead, smsSent: false, smsSkippedReason: 'mesaj SMS necompletat în setări' };
  }

  try {
    await sendSMS(input.phone, body);
    return { lead, smsSent: true };
  } catch (error) {
    // Lead-ul e deja în CRM — un SMS eșuat nu trebuie să întoarcă eroare
    // către site, altfel utilizatorul vede formularul ca picat.
    console.error('[web-lead] SMS de confirmare eșuat:', error);
    return { lead, smsSent: false, smsSkippedReason: 'eroare la trimiterea SMS-ului' };
  }
}
