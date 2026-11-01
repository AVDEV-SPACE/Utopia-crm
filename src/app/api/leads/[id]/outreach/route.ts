import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isEmailConfigured, isSmsConfigured } from '@/lib/messaging';
import { getTenantContext } from '@/lib/tenant';
import { getLeadById } from '@/services/leads/repository';
import { CHANNEL_MAX_CHARS, DIRECT_CHANNELS } from '@/services/outreach/channels';
import { DirectSendError, sendDirect } from '@/services/outreach/direct';
import { senderFooter } from '@/services/outreach/email';
import { sql } from '@/lib/neon';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contextul compozitorului din fișa lead-ului: ce canale pot trimite din CRM
 * și dacă lead-ul are o secvență automată activă (pe care un email manual o preia).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

  let pendingSteps = 0;
  try {
    const rows = await sql`SELECT count(*)::int AS n FROM outreach_tasks WHERE lead_id = ${params.id}::uuid AND status = 'pending'`;
    pendingSteps = (rows[0] as { n: number }).n;
  } catch {
    // Fără tabelele de outreach nu există secvențe
  }

  return NextResponse.json({
    configured: { email: isEmailConfigured(), sms: isSmsConfigured() },
    footer: Boolean(senderFooter()),
    pendingSteps,
  });
}

const bodySchema = z
  .object({
    channel: z.enum(DIRECT_CHANNELS as [string, ...string[]]),
    subject: z.string().trim().max(300).nullish(),
    body: z.string().trim().min(1, 'Mesajul e gol'),
    templateId: z.string().max(64).nullish(),
    templateTitle: z.string().trim().max(300).nullish(),
  })
  .superRefine((d, ctx) => {
    const max = CHANNEL_MAX_CHARS[d.channel as keyof typeof CHANNEL_MAX_CHARS];
    if (d.body.length > max) ctx.addIssue({ code: 'custom', message: `Mesajul depășește ${max} de caractere pentru acest canal` });
  });

/** Trimite (email, SMS) sau înregistrează o trimitere manuală (WhatsApp, Instagram, Facebook, LinkedIn). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });
  if (!z.string().uuid().safeParse(params.id).success) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }

  try {
    const lead = await getLeadById(params.id);
    if (!lead) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });

    const d = parsed.data;
    const result = await sendDirect(
      lead,
      {
        channel: d.channel as (typeof DIRECT_CHANNELS)[number],
        subject: d.subject ?? null,
        body: d.body,
        templateId: d.templateId ?? null,
        templateTitle: d.templateTitle ?? null,
      },
      tenant
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DirectSendError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Trimitere din fișa lead-ului eșuată:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
