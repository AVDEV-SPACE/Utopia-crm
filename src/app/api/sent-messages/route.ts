import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/neon';
import { getTenantContext } from '@/lib/tenant';
import { listSentMessages, logSentMessages } from '@/services/messages/repository';
import { MessageChannel, MessageRecipientType } from '@/services/messages/types';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Canale care pot fi scrise în jurnal (constrângerea CHECK din DB). */
const CHANNELS = ['email', 'sms', 'whatsapp'] as const;
/** La citire se poate filtra și pe `instagram`, care vine din leads.pitch_channel. */
const FILTERABLE_CHANNELS: readonly string[] = [...CHANNELS, 'instagram'];
const RECIPIENT_TYPES = ['lead', 'client'] as const;

const asChannel = (value: string | null): MessageChannel | null =>
  value && FILTERABLE_CHANNELS.includes(value) ? (value as MessageChannel) : null;

const asRecipientType = (value: string | null): MessageRecipientType | null =>
  value && RECIPIENT_TYPES.includes(value as MessageRecipientType)
    ? (value as MessageRecipientType)
    : null;

// ── GET: jurnalul mesajelor trimise ────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get('limit'));

    const messages = await listSentMessages(tenant.orgId, {
      channel: asChannel(searchParams.get('channel')),
      recipientType: asRecipientType(searchParams.get('type')),
      leadId: searchParams.get('leadId'),
      search: searchParams.get('q'),
      ...(Number.isFinite(limitParam) && limitParam > 0 ? { limit: limitParam } : {}),
    });

    return NextResponse.json(messages, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Error fetching sent messages:', error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}

/** 42P01 = undefined_table — migrarea nu a fost rulată pe baza de date curentă. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '42P01') {
    return 'Tabela sent_messages lipsește. Rulează setup-db-sent-messages.sql în Neon (sau POST /api/setup).';
  }
  return 'Internal server error';
}

// ── POST: înregistrează o trimitere făcută manual (WhatsApp de pe telefon) ──
const manualLogSchema = z.object({
  channel: z.enum(CHANNELS),
  recipient_type: z.enum(RECIPIENT_TYPES).default('lead'),
  lead_id: z.string().uuid().nullish(),
  recipient_name: z.string().trim().max(200).nullish(),
  recipient_email: z.string().trim().max(320).nullish(),
  recipient_phone: z.string().trim().max(32).nullish(),
  subject: z.string().trim().max(500).nullish(),
  body: z.string().min(1, 'body este obligatoriu'),
  template_id: z.string().max(64).nullish(),
  template_title: z.string().trim().max(300).nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const parsed = manualLogSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    await logSentMessages(tenant, [{ ...parsed.data, status: 'sent' }]);

    // Trimiterea manuală contează la fel ca una automată pentru statusul lead-ului
    if (parsed.data.lead_id) {
      await sql`
        UPDATE leads SET status = 'sent', updated_at = now()
        WHERE id = ${parsed.data.lead_id}::uuid AND status IN ('new', 'scored', 'pitch_ready')
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging sent message:', error);
    return NextResponse.json({ error: describeError(error) }, { status: 500 });
  }
}
