import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, updateLead } from '@/services/leads/repository';
import { sendEmail, sendSMS, stripHtml, isEmailConfigured, isSmsConfigured } from '@/lib/messaging';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    if (!lead.pitch_generated) {
      return NextResponse.json({ error: 'Generează întâi un pitch pentru acest lead.' }, { status: 400 });
    }

    // Canalul de livrare se decide după contactul disponibil, nu după pitch_channel
    // (care descrie doar tonul textului) — email dacă există, altfel SMS.
    if (lead.contact_email) {
      if (!isEmailConfigured()) {
        return NextResponse.json(
          { error: 'Email neconfigurat: adaugă GMAIL_APP_PASSWORD în .env' },
          { status: 503 }
        );
      }
      await sendEmail(lead.contact_email, lead.pitch_subject || 'Mesaj de la Utopia Systems', lead.pitch_generated);
    } else if (lead.contact_phone) {
      if (!isSmsConfigured()) {
        return NextResponse.json(
          { error: 'SMS neconfigurat: adaugă TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER în .env' },
          { status: 503 }
        );
      }
      await sendSMS(lead.contact_phone, stripHtml(lead.pitch_generated));
    } else {
      return NextResponse.json(
        { error: 'Lead-ul nu are nici email, nici telefon — trimite manual (ex. Instagram DM).' },
        { status: 400 }
      );
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
