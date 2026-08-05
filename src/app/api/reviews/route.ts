// src/app/api/reviews/route.ts
import { sql } from '@/lib/neon';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await sql`SELECT * FROM internal_reviews ORDER BY created_at DESC`;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}