import { NextResponse } from 'next/server';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { getTenantContext } from '@/lib/tenant';
import { getSettingsByOrgId } from '@/services/followups/settings';
import { missingSocialEnv, socialOrgId } from '@/services/social/config';
import { checkConnection } from '@/services/social/graph';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  return base.replace(/\/+$/, '');
}

/**
 * Tab-ul „Setări” din /socials: ce variabile lipsesc (doar numele), verificările
 * live prin Graph (token, pagină, cont IG, abonarea webhook-ului) și setările
 * AI. Nu întoarce niciun token sau secret.
 */
export async function GET() {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const missing = missingSocialEnv();
  const orgId = socialOrgId();
  const tenant = await getTenantContext();

  let settings: { social_ai_enabled: boolean; human_takeover_minutes: number } | null = null;
  let settingsError: string | null = null;
  if (orgId) {
    try {
      const row = await getSettingsByOrgId(orgId);
      settings = row ? { social_ai_enabled: Boolean(row.social_ai_enabled), human_takeover_minutes: row.human_takeover_minutes } : null;
    } catch (error) {
      const code = (error as { code?: string }).code;
      settingsError = code === '42P01' ? 'Rulează setup-db-socials.sql în Neon' : 'Setările nu au putut fi citite';
    }
  }

  const base = appBaseUrl();
  return NextResponse.json(
    {
      missingEnv: missing,
      verifyTokenSet: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN?.trim()),
      webhookUrl: base ? `${base}/api/webhooks/meta` : null,
      // Tenant-ul paginilor vs. al sesiunii (utilizatorul vede datele doar dacă e același)
      sameTenant: Boolean(orgId && tenant && orgId === tenant.orgId),
      connection: missing.length === 0 ? await checkConnection() : null,
      settings,
      settingsError,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
