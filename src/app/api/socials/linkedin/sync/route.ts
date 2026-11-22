import { NextResponse } from 'next/server';
import { requireSocialAccess } from '@/lib/social-auth';
import { syncLinkedInComments } from '@/services/social/linkedin/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** „Sincronizează acum” din /socials → LinkedIn: citește comentariile noi de la ultimele postări. */
export async function POST() {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const result = await syncLinkedInComments(access.orgId);
  return NextResponse.json(result, { status: result.errors.length > 0 && result.posts === 0 ? 502 : 200 });
}
