import { NextRequest, NextResponse } from 'next/server';
import { listLeads, createManualLead } from '@/services/leads/repository';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET() {
  try {
    const leads = await listLeads();
    return NextResponse.json(leads, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company_name, contact_email, contact_phone, niche, location } = body;

    if (!company_name) {
      return NextResponse.json({ error: 'Missing required field: company_name' }, { status: 400 });
    }
    if (!contact_email && !contact_phone) {
      return NextResponse.json({ error: 'Trebuie completat cel puțin contact_email sau contact_phone' }, { status: 400 });
    }

    const lead = await createManualLead({ company_name, contact_email, contact_phone, niche, location });
    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error creating lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
