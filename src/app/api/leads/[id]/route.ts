import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLeadById, updateLead, deleteLead, LeadPatch } from '@/services/leads/repository';
import { logStatusChange } from '@/services/leads/notes';
import { getTenantContext } from '@/lib/tenant';
import { currentUserLabel } from '@/lib/user-label';

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

/** Text opțional: `''` din formular devine `null` (golește câmpul în DB). */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const patchSchema = z.object({
  company_name: z.string().trim().min(1, 'Numele firmei nu poate fi gol').max(200).optional(),
  website: optionalText(500),
  niche: optionalText(120),
  location: optionalText(120),
  contact_email: optionalText(320),
  contact_instagram: optionalText(200),
  contact_phone: optionalText(40),
  status: z
    .enum(['new', 'scored', 'pitch_ready', 'sent', 'replied', 'negotiating', 'won', 'lost'])
    .optional(),
  notes: optionalText(5000),
  pitch_generated: optionalText(20000),
  pitch_subject: optionalText(500),
  pitch_channel: z.enum(['email', 'instagram', 'whatsapp']).optional(),
  payment_link: optionalText(1000),
  // Câmpuri venite din import (source='sheet'), editabile manual după aceea
  category: optionalText(120),
  address: optionalText(300),
  opening_hours: optionalText(300),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Date invalide' },
        { status: 400 }
      );
    }

    // Emailul, dacă e completat, trebuie să fie valid — altfel trimiterile eșuează tăcut
    if (parsed.data.contact_email && !z.string().email().safeParse(parsed.data.contact_email).success) {
      return NextResponse.json({ error: 'Adresa de email nu este validă' }, { status: 400 });
    }

    const previous = await getLeadById(id);
    if (!previous) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    const lead = await updateLead(id, parsed.data as LeadPatch);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    // Istoricul trebuie să arate și etapele prin care a trecut lead-ul
    if (parsed.data.status && parsed.data.status !== previous.status) {
      const tenant = await getTenantContext();
      await logStatusChange({
        leadId: id,
        orgId: tenant?.orgId ?? null,
        authorId: tenant?.userId ?? null,
        authorName: await currentUserLabel(),
        from: previous.status,
        to: parsed.data.status,
      });
    }

    return NextResponse.json(lead);
  } catch (error) {
    console.error('Error updating lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Ștergere definitivă a unui lead (ex. date introduse greșit). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { id } = await params;
    const removed = await deleteLead(id);
    if (!removed) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
