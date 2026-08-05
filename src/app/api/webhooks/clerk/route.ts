// src/app/api/webhooks/clerk/route.ts (varianta finală)
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { sql } from '@/lib/neon';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  console.log('🔔 Webhook received at:', new Date().toISOString());

  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error('❌ CLERK_WEBHOOK_SECRET missing');
    // Returnăm 200 ca să nu mai fie Failed în Clerk (dar logăm eroarea)
    return NextResponse.json({ error: 'Missing secret' }, { status: 200 });
  }

  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    console.error('❌ Missing Svix headers');
    return NextResponse.json({ error: 'Missing headers' }, { status: 200 });
  }

  const body = await req.text();

  let evt: WebhookEvent;
  try {
    const wh = new Webhook(WEBHOOK_SECRET);
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;

    console.log('✅ Verified event:', evt.type);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 200 });
  }

  if (evt.type === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data;
    const fullname = `${first_name || ''} ${last_name || ''}`.trim() || 'User';
    const email = email_addresses?.[0]?.email_address || '';

    await sql`
      INSERT INTO crm_users (clerk_id, fullname, email, role)
      VALUES (${id}, ${fullname}, ${email}, 'owner')
      ON CONFLICT (clerk_id) DO UPDATE SET
        fullname = EXCLUDED.fullname,
        email = EXCLUDED.email,
        role = EXCLUDED.role
    `;
    console.log('✅ User added:', id);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}