import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/secret';
import { requireSocialAccess } from '@/lib/social-auth';
import { appBaseUrl, LINKEDIN_STATE_COOKIE as STATE_COOKIE, linkedinOrgUrn } from '@/services/social/linkedin/config';
import { administeredOrganizations, exchangeCode, fetchMember } from '@/services/social/linkedin/oauth';
import { saveConnection } from '@/services/social/linkedin/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Înapoi în /socials → LinkedIn, cu rezultatul în query (afișat ca toast). */
function backToSocials(req: NextRequest, result: { ok: true } | { ok: false; error: string }): NextResponse {
  const url = new URL('/socials', appBaseUrl() || req.url);
  url.searchParams.set('tab', 'linkedin');
  if (result.ok) url.searchParams.set('linkedin', 'connected');
  else url.searchParams.set('linkedin_error', result.error.slice(0, 200));
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: STATE_COOKIE, path: '/api/socials/linkedin' });
  return res;
}

/**
 * Callback-ul OAuth LinkedIn: verifică `state`, schimbă codul pe token,
 * confirmă că adminul autorizat chiar administrează pagina din LINKEDIN_ORG_ID,
 * apoi salvează conexiunea criptată. Rămâne sub Clerk (sesiunea owner-ului).
 */
export async function GET(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const params = req.nextUrl.searchParams;
  const denied = params.get('error');
  if (denied) return backToSocials(req, { ok: false, error: params.get('error_description') ?? denied });

  const state = params.get('state') ?? '';
  const expected = req.cookies.get(STATE_COOKIE)?.value ?? '';
  if (!state || !expected || !safeEqual(state, expected)) {
    return backToSocials(req, { ok: false, error: 'Sesiunea de autorizare a expirat — încearcă din nou' });
  }
  const code = params.get('code');
  if (!code) return backToSocials(req, { ok: false, error: 'LinkedIn nu a trimis codul de autorizare' });

  const organizationUrn = linkedinOrgUrn();
  if (!organizationUrn) return backToSocials(req, { ok: false, error: 'LINKEDIN_ORG_ID nu este setat' });

  try {
    const tokens = await exchangeCode(code);
    const organizations = await administeredOrganizations(tokens.accessToken);
    if (!organizations.includes(organizationUrn)) {
      return backToSocials(req, {
        ok: false,
        error: 'Contul autorizat nu e ADMINISTRATOR al paginii Utopia Systems — conectează-te cu un admin al paginii',
      });
    }
    const member = await fetchMember(tokens.accessToken);
    await saveConnection({
      orgId: access.orgId,
      organizationUrn,
      tokens,
      memberUrn: member.urn,
      memberName: member.name,
      connectedBy: access.userId,
    });
    return backToSocials(req, { ok: true });
  } catch (error) {
    console.error('[linkedin/callback] conectarea a eșuat:', (error as Error).message);
    const code = (error as { code?: string }).code;
    const message = code === '42P01' ? 'Rulează setup-db-linkedin.sql în Neon' : 'Conectarea LinkedIn a eșuat — vezi log-urile';
    return backToSocials(req, { ok: false, error: message });
  }
}
