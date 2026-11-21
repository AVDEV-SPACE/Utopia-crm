import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/neon';
import { authorizedUserId } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;

const UpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Numele e obligatoriu').max(200),
    email: z.string().trim().email('Email invalid').max(320),
    company: z.string().trim().max(200).nullable(),
    service: z.string().trim().max(200).nullable(),
    message: z.string().trim().max(5000).nullable(),
    meeting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dată invalidă'),
    meeting_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Oră invalidă'),
    status: z.enum(BOOKING_STATUSES),
  })
  .partial();

/**
 * Editarea unei programări din /bookings (fișa deschisă la click pe rând).
 * Actualizează doar câmpurile trimise. Telefonul nu e aici: vine din `contacts`.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await authorizedUserId();
  if (!userId) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Date invalide' }, { status: 400 });
  }
  const d = parsed.data;
  const has = (key: keyof typeof d) => Object.prototype.hasOwnProperty.call(d, key);

  try {
    const rows = await sql`
      UPDATE bookings SET
        name         = CASE WHEN ${has('name')}         THEN ${d.name ?? null}         ELSE name END,
        email        = CASE WHEN ${has('email')}        THEN ${d.email ?? null}        ELSE email END,
        company      = CASE WHEN ${has('company')}      THEN ${d.company ?? null}      ELSE company END,
        service      = CASE WHEN ${has('service')}      THEN ${d.service ?? null}      ELSE service END,
        message      = CASE WHEN ${has('message')}      THEN ${d.message ?? null}      ELSE message END,
        meeting_date = CASE WHEN ${has('meeting_date')} THEN ${d.meeting_date ?? null}::date ELSE meeting_date END,
        meeting_time = CASE WHEN ${has('meeting_time')} THEN ${d.meeting_time ?? null} ELSE meeting_time END,
        status       = CASE WHEN ${has('status')}       THEN ${d.status ?? null}       ELSE status END
      WHERE id::text = ${params.id}
      RETURNING id::text, name, email, company AS company_name, service, message,
                meeting_date, meeting_time, status, meet_link, created_at
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'Programarea nu există' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('[bookings/:id] PATCH error:', error);
    return NextResponse.json({ error: 'Nu am putut salva programarea' }, { status: 500 });
  }
}
