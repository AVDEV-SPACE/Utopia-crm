import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { sendEmail, sendSMS, stripHtml, isEmailConfigured, isSmsConfigured } from '@/lib/messaging';

// ── Helpers ────────────────────────────────────────────────────────────────
function getStartDate(timeFilter: string | null): Date | null {
  if (!timeFilter || timeFilter === 'all') return null;
  const ms = { '30_days': 30, '3_months': 90, '6_months': 180, '12_months': 365 };
  const days = ms[timeFilter as keyof typeof ms];
  return days ? new Date(Date.now() - days * 86400000) : null;
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      templateId,
      serviceFilter,
      timeFilter,
      recipientEmails,   // array of email strings selected in UI
      leadIds,           // array of lead UUIDs selected în UI (tabelul leads)
      scheduledAt,
      channel = 'email', // 'email' | 'sms'
    } = body;

    const leadIdList: string[] | null = Array.isArray(leadIds) && leadIds.length > 0 ? leadIds : null;
    const emails: string[] | null = Array.isArray(recipientEmails) && recipientEmails.length > 0
      ? recipientEmails
      : null;

    // Template obligatoriu doar dacă vor exista și destinatari non-lead (contacts/bookings) —
    // lead-urile au fiecare propriul pitch generat, nu au nevoie de un șablon comun.
    const willHaveContactRecipients = Boolean(serviceFilter || emails || !leadIdList);
    if (!templateId && willHaveContactRecipients) {
      return NextResponse.json({ error: 'Missing templateId' }, { status: 400 });
    }

    // ── Config validation ──────────────────────────────────────────────────
    if (channel === 'email' && !isEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            'Email neconfigurat: adaugă GMAIL_APP_PASSWORD în .env\n' +
            'Instrucțiuni: https://myaccount.google.com/apppasswords',
        },
        { status: 503 }
      );
    }

    if (channel === 'sms' && !isSmsConfigured()) {
      return NextResponse.json(
        {
          error:
            'SMS neconfigurat: adaugă în .env valorile:\n' +
            'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER\n' +
            'Obții-le din https://console.twilio.com',
        },
        { status: 503 }
      );
    }

    // ── Fetch template (dacă e cazul) ──────────────────────────────────────
    let template: { title: string; content: string } | null = null;
    if (templateId) {
      const templates = await sql`
        SELECT * FROM educational_templates
        WHERE id = ${templateId}
          AND (created_by = ${userId} OR is_default = true)
      `;
      if (templates.length === 0) {
        return NextResponse.json({ error: 'Template negăsit' }, { status: 404 });
      }
      template = templates[0] as { title: string; content: string };
    }

    const startDate = getStartDate(timeFilter as string | null);

    // ── Fetch recipients (contacts/bookings) ───────────────────────────────
    // Neon sql returns Record<string,unknown>[] — typed loosely, fields accessed at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let recipients: any[] = [];

    if (!willHaveContactRecipients) {
      // no-op — recipients rămâne []
    } else if (channel === 'sms') {
      // Necesită telefon → contacts JOIN bookings (pentru filtrul de serviciu)
      if (serviceFilter && startDate && emails) {
        recipients = await sql`
          SELECT DISTINCT ON (c.email) c.full_name AS name, c.email, c.phone
          FROM contacts c
          INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
          WHERE c.phone IS NOT NULL AND c.email IS NOT NULL
            AND b.service = ${serviceFilter}
            AND b.created_at >= ${startDate.toISOString()}
            AND LOWER(c.email) = ANY(${emails.map(e => e.toLowerCase())})
          ORDER BY c.email, b.created_at DESC LIMIT 100
        `;
      } else if (serviceFilter && startDate) {
        recipients = await sql`
          SELECT DISTINCT ON (c.email) c.full_name AS name, c.email, c.phone
          FROM contacts c
          INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
          WHERE c.phone IS NOT NULL AND c.email IS NOT NULL
            AND b.service = ${serviceFilter}
            AND b.created_at >= ${startDate.toISOString()}
          ORDER BY c.email, b.created_at DESC LIMIT 100
        `;
      } else if (serviceFilter && emails) {
        recipients = await sql`
          SELECT DISTINCT ON (c.email) c.full_name AS name, c.email, c.phone
          FROM contacts c
          INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
          WHERE c.phone IS NOT NULL AND c.email IS NOT NULL
            AND b.service = ${serviceFilter}
            AND LOWER(c.email) = ANY(${emails.map(e => e.toLowerCase())})
          ORDER BY c.email, b.created_at DESC LIMIT 100
        `;
      } else if (emails) {
        recipients = await sql`
          SELECT full_name AS name, email, phone FROM contacts
          WHERE phone IS NOT NULL AND email IS NOT NULL
            AND LOWER(email) = ANY(${emails.map(e => e.toLowerCase())})
          LIMIT 100
        `;
      } else {
        recipients = await sql`
          SELECT DISTINCT ON (c.email) c.full_name AS name, c.email, c.phone
          FROM contacts c
          INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
          WHERE c.phone IS NOT NULL AND c.email IS NOT NULL
          ORDER BY c.email, b.created_at DESC LIMIT 100
        `;
      }
    } else {
      // Email → bookings (are name + email + service direct, fără JOIN)
      if (serviceFilter && startDate && emails) {
        recipients = await sql`
          SELECT DISTINCT ON (email) name, email FROM bookings
          WHERE email IS NOT NULL
            AND service = ${serviceFilter}
            AND created_at >= ${startDate.toISOString()}
            AND LOWER(email) = ANY(${emails.map(e => e.toLowerCase())})
          ORDER BY email, created_at DESC LIMIT 100
        `;
      } else if (serviceFilter && startDate) {
        recipients = await sql`
          SELECT DISTINCT ON (email) name, email FROM bookings
          WHERE email IS NOT NULL
            AND service = ${serviceFilter}
            AND created_at >= ${startDate.toISOString()}
          ORDER BY email, created_at DESC LIMIT 100
        `;
      } else if (serviceFilter && emails) {
        recipients = await sql`
          SELECT DISTINCT ON (email) name, email FROM bookings
          WHERE email IS NOT NULL
            AND service = ${serviceFilter}
            AND LOWER(email) = ANY(${emails.map(e => e.toLowerCase())})
          ORDER BY email, created_at DESC LIMIT 100
        `;
      } else if (emails) {
        recipients = await sql`
          SELECT DISTINCT ON (email) name, email FROM bookings
          WHERE email IS NOT NULL
            AND LOWER(email) = ANY(${emails.map(e => e.toLowerCase())})
          ORDER BY email, created_at DESC LIMIT 100
        `;
      } else {
        recipients = await sql`
          SELECT DISTINCT ON (email) name, email FROM bookings
          WHERE email IS NOT NULL
          ORDER BY email, created_at DESC LIMIT 100
        `;
      }
    }

    // ── Lead-uri selectate — folosesc pitch-ul propriu generat dacă există,
    // altfel cad pe șablonul comun selectat (vezi maparea de mai jos) ──
    if (leadIdList) {
      const leadRows = channel === 'sms'
        ? await sql`
            SELECT id AS lead_id, company_name AS name, contact_phone AS phone,
                   pitch_generated, pitch_subject
            FROM leads
            WHERE id = ANY(${leadIdList}::uuid[]) AND contact_phone IS NOT NULL
          `
        : await sql`
            SELECT id AS lead_id, company_name AS name, contact_email AS email,
                   pitch_generated, pitch_subject
            FROM leads
            WHERE id = ANY(${leadIdList}::uuid[]) AND contact_email IS NOT NULL
          `;
      recipients = [...recipients, ...leadRows];
    }

    if (recipients.length === 0) {
      const msg = channel === 'sms'
        ? 'Niciun destinatar cu număr de telefon și pitch generat găsit pentru filtrele selectate'
        : 'Niciun destinatar cu email și pitch generat găsit pentru filtrele selectate';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // ── Programat ─────────────────────────────────────────────────────────
    // Notă: procesorul de mesaje programate (/api/process-scheduled) încă nu
    // respectă filtrele salvate — programarea pt. lead-uri nu e susținută complet.
    if (scheduledAt) {
      if (!templateId) {
        return NextResponse.json({ error: 'Programarea necesită un șablon selectat' }, { status: 400 });
      }
      if (new Date(scheduledAt) <= new Date()) {
        return NextResponse.json({ error: 'Ora programată trebuie să fie în viitor' }, { status: 400 });
      }
      await sql`
        INSERT INTO scheduled_messages
          (template_id, service_filter, time_filter, recipient_ids, scheduled_at, created_by)
        VALUES
          (${templateId}, ${serviceFilter ?? null}, ${timeFilter ?? null},
           ${JSON.stringify(recipientEmails)}, ${scheduledAt}, ${userId})
      `;
      return NextResponse.json({
        success: true,
        message: `Mesaj programat pentru ${recipients.length} destinatari`,
        count: recipients.length,
      });
    }

    // ── Trimitere imediată ─────────────────────────────────────────────────
    const results = await Promise.allSettled(
      recipients.map(r => {
        // Destinatar din leads → folosește pitch-ul propriu generat, nu template-ul comun
        if (r.pitch_generated) {
          const subject = r.pitch_subject || 'Mesaj de la Utopia Systems';
          if (channel === 'sms') {
            return sendSMS(r.phone!, stripHtml(r.pitch_generated));
          }
          return sendEmail(r.email, subject, r.pitch_generated);
        }
        // Destinatar din contacts/bookings → template-ul comun selectat
        const text = template!.content.replace(/\{\{name\}\}/g, r.name || 'Client');
        if (channel === 'sms') {
          return sendSMS(r.phone!, stripHtml(text));
        }
        return sendEmail(r.email, template!.title, text);
      })
    );

    const failed = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    const sent = results.length - failed.length;

    if (sent === 0) {
      const firstErr = failed[0]?.reason?.message || 'eroare necunoscută';
      return NextResponse.json(
        { error: `Toate mesajele au eșuat: ${firstErr}` },
        { status: 500 }
      );
    }

    // Marchează lead-urile trimise cu succes ca 'sent'
    const sentLeadIds = recipients
      .map((r, i) => ({ r, ok: results[i].status === 'fulfilled' }))
      .filter(({ r, ok }) => ok && r.lead_id)
      .map(({ r }) => r.lead_id as string);
    if (sentLeadIds.length > 0) {
      await sql`UPDATE leads SET status = 'sent', updated_at = now() WHERE id = ANY(${sentLeadIds}::uuid[])`;
    }

    const label = channel === 'sms' ? 'SMS-uri' : 'email-uri';
    return NextResponse.json({
      success: true,
      message: `${sent} ${label} trimise${failed.length > 0 ? `, ${failed.length} eșuate` : ''}`,
      count: sent,
    });
  } catch (error) {
    console.error('Send route error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
