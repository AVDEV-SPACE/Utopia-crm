import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, updateLead } from '@/services/leads/repository';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, notes, pitch_generated, pitch_subject, pitch_channel } = body;

    const lead = await updateLead(id, { status, notes, pitch_generated, pitch_subject, pitch_channel });
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });
    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
