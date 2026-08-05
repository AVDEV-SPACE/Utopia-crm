// src/app/api/check-authorization/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const role = searchParams.get('role');

  // Adaugă logging
  console.log('Received email:', email);
  console.log('Received role:', role);
  console.log('Full URL:', req.url);

  if (!email || !role || !['owner', 'assistant'].includes(role)) {
    console.log('Missing parameters or invalid role');
    return NextResponse.json({ authorized: false }, { status: 400 });
  }

  const table = role === 'owner' ? 'allowed_owners' : 'allowed_assistants';

  try {
    console.log(`Checking ${table} for email:`, email.toLowerCase());
    const result = await sql`SELECT email FROM ${sql.unsafe(table)} WHERE email = ${email.toLowerCase()}`;
    console.log('Query result:', result);
    const authorized = result.length > 0;
    return NextResponse.json({ authorized });
  } catch (error) {
    console.error('Error checking authorization:', error);
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
}