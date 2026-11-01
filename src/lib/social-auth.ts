import { NextResponse } from 'next/server';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { socialOrgId } from '@/services/social/config';

/**
 * Rutele /api/socials/*: sub Clerk în middleware, plus rolul owner (ca
 * /pipeline). Datele sociale aparțin tenant-ului din SOCIAL_ORG_ID — același
 * pe care îl folosește webhook-ul Meta. Întoarce contextul sau răspunsul de eroare.
 */
export async function requireSocialAccess(): Promise<{ userId: string; orgId: string } | NextResponse> {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const orgId = socialOrgId();
  if (!orgId) {
    return NextResponse.json({ error: 'SOCIAL_ORG_ID nu este setat — integrarea Meta nu are tenant' }, { status: 503 });
  }
  return { userId: access.userId, orgId };
}
