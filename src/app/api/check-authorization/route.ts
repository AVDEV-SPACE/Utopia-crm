// src/app/api/check-authorization/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { isEmailAllowed } from '@/lib/authorization';

export const dynamic = 'force-dynamic';

/**
 * Verificarea allowlist-ului din formularul de sign-up (rută publică).
 * E doar un filtru de UX: accesul real îl decide middleware-ul, pe server,
 * după emailurile verificate ale contului. Nu loghează emailuri (date personale).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const role = searchParams.get('role');

  if (!email || (role !== 'owner' && role !== 'assistant')) {
    return NextResponse.json({ authorized: false }, { status: 400 });
  }

  try {
    return NextResponse.json({ authorized: await isEmailAllowed(email, role) });
  } catch (error) {
    console.error('Error checking authorization:', error instanceof Error ? error.message : error);
    return NextResponse.json({ authorized: false }, { status: 500 });
  }
}
