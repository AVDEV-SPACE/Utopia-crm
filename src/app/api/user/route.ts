// src/app/api/user/route.ts
import { sql } from '@/lib/neon';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clerkId = searchParams.get('clerkId');

  if (!clerkId) {
    return NextResponse.json({ error: 'Missing clerkId' }, { status: 400 });
  }

  try {
    const result = await sql`SELECT * FROM crm_users WHERE clerk_id = ${clerkId}`;
    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    return NextResponse.json(result[0]);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}