import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, updateLead } from '@/services/leads/repository';
import { createPaymentLink } from '@/services/leads/payment';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    // Link-ul de plată se generează doar după ce prețul a fost confirmat
    // manual în urma discuției de consultanță (status = negotiating).
    if (lead.status !== 'negotiating') {
      return NextResponse.json(
        {
          error:
            'Link-ul de plată poate fi generat doar pentru lead-uri aflate în status "negotiating" ' +
            '(după ce prețul a fost confirmat manual în urma discuției de consultanță).',
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { amountEur, label } = body as { amountEur?: number; label?: string };

    if (!amountEur || amountEur <= 0) {
      return NextResponse.json({ error: 'amountEur trebuie să fie un număr pozitiv' }, { status: 400 });
    }

    const paymentLink = await createPaymentLink({
      amountEur,
      label: label ?? `Serviciu Utopia Systems — ${lead.company_name}`,
      clientEmail: lead.contact_email,
    });

    const updated = await updateLead(id, { payment_link: paymentLink });

    return NextResponse.json({ lead: updated, payment_link: paymentLink });
  } catch (error) {
    console.error('Error creating payment link:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
