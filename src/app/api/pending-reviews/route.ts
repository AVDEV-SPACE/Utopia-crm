// src/app/api/pending-reviews/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, service, appointment_date, review_email_scheduled_for, sent, created_at } = body;

    const result = await sql`
      INSERT INTO pending_reviews (email, name, service, appointment_date, review_email_scheduled_for, sent, created_at)
      VALUES (${email}, ${name}, ${service}, ${appointment_date}, ${review_email_scheduled_for}, ${sent}, ${created_at})
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating pending review:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}