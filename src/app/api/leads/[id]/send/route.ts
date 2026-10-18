import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, updateLead } from '@/services/leads/repository';
import { sendEmail, sendSMS, stripHtml, isEmailConfigured, isSmsConfigured } from '@/lib/messaging';
import { getTenantContext } from '@/lib/tenant';
import { logSentMessages } from '@/services/messages/repository';
import { NewSentMessage } from '@/services/messages/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    if (!lead.pitch_generated) {
      return NextResponse.json({ error: 'Generează întâi un pitch pentru acest lead.' }, { status: 400 });
    }

    const subject = lead.pitch_subject || 'Mesaj de la Utopia Systems';
    const base = {
      recipient_type: 'lead' as const,
      lead_id: lead.id,
      recipient_name: lead.company_name,
      recipient_email: lead.contact_email,
      recipient_phone: lead.contact_phone,
      template_title: 'Pitch personalizat',
    };
    let entry: NewSentMessage;

    // Canalul de livrare se decide după contactul disponibil, nu după pitch_channel
    // (care descrie doar tonul textului) — email dacă există, altfel SMS.
    if (lead.contact_email) {
      if (!isEmailConfigured()) {
        return NextResponse.json(
          { error: 'Email neconfigurat: adaugă GMAIL_APP_PASSWORD în .env' },
          { status: 503 }
        );
      }
      const messageId = await sendEmail(lead.contact_email, subject, lead.pitch_generated);
      entry = { ...base, channel: 'email', subject, body: lead.pitch_generated, message_id: messageId };
    } else if (lead.contact_phone) {
      if (!isSmsConfigured()) {
        return NextResponse.json(
          { error: 'SMS neconfigurat: adaugă TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER în .env' },
          { status: 503 }
        );
      }
      const text = stripHtml(lead.pitch_generated);
      await sendSMS(lead.contact_phone, text);
      entry = { ...base, channel: 'sms', body: text };
    } else {
      return NextResponse.json(
        { error: 'Lead-ul nu are nici email, nici telefon — trimite manual (ex. Instagram DM).' },
        { status: 400 }
      );
    }

    // Jurnalul face trimiterea vizibilă în „Pitched”, cu link spre email și
    // urmărirea răspunsului. Nu rupe răspunsul: mesajul a plecat deja.
    try {
      const tenant = await getTenantContext();
      if (tenant) await logSentMessages(tenant, [entry]);
    } catch (logErr) {
      console.error('Nu am putut jurnaliza pitch-ul trimis:', logErr);
    }

    const updated = await updateLead(id, { status: 'sent' });
    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error('Error sending lead pitch:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
