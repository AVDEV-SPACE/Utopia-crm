import { NextRequest, NextResponse } from 'next/server';
import { getLeadById, updateLead } from '@/services/leads/repository';
import { generatePitch } from '@/services/leads/pitch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    const pitch = await generatePitch(lead);
    const updated = await updateLead(id, {
      pitch_generated: pitch.body,
      pitch_subject: pitch.subject,
      status: 'pitch_ready',
    });

    return NextResponse.json({ lead: updated, pitch });
  } catch (error) {
    console.error('Error generating pitch:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
