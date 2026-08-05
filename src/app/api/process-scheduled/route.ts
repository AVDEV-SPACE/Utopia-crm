import { sql } from '@/lib/neon';
import { sendEducationalEmails } from '@/actions/send-emails';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const dueMessages = await sql`
      SELECT sm.*, et.content AS template_content, et.title AS template_title
      FROM scheduled_messages sm
      JOIN educational_templates et ON sm.template_id = et.id
      WHERE sm.status = 'pending' AND sm.scheduled_at <= NOW()
    `;

    if (dueMessages.length === 0) {
      return NextResponse.json({ message: 'No scheduled messages to process' });
    }

    let processed = 0;
    let errors = 0;

    for (const message of dueMessages) {
      try {
        // Build recipient list from contacts + bookings
        const patients = await sql`
          SELECT DISTINCT ON (c.email) c.full_name AS name, c.email
          FROM contacts c
          INNER JOIN bookings b ON LOWER(b.email) = LOWER(c.email)
          WHERE c.email IS NOT NULL
          ORDER BY c.email, b.created_at DESC
          LIMIT 100
        `;

        if (Array.isArray(patients) && patients.length > 0) {
          const result = await sendEducationalEmails(
            message.template_content,
            patients as { name: string; email: string }[]
          );

          if (result.success) {
            processed++;
          } else {
            errors++;
            console.error('Failed to send scheduled message:', result.message);
          }
        }

        await sql`
          UPDATE scheduled_messages SET status = 'sent' WHERE id = ${message.id}
        `;
      } catch (err) {
        errors++;
        console.error('Error processing scheduled message:', err);
        await sql`
          UPDATE scheduled_messages SET status = 'failed' WHERE id = ${message.id}
        `;
      }
    }

    return NextResponse.json({ message: `Processed ${processed} messages, ${errors} errors` });
  } catch (error) {
    console.error('Error processing scheduled messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
