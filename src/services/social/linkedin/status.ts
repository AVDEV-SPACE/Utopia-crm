import { linkedin, encodeUrn } from './api';
import { linkedinOrgUrn, linkedinRedirectUri, missingLinkedinEnv } from './config';
import { administeredOrganizations } from './oauth';
import { getAccessToken, getConnection, type LinkedInConnection } from './tokens';

/**
 * Starea integrării LinkedIn pentru /socials → LinkedIn: ce lipsește din env,
 * conexiunea salvată (fără tokeni) și verificările live (token, rol de admin, pagină).
 */

export interface LinkedInCheck {
  ok: boolean;
  detail: string;
}

export interface LinkedInStatus {
  missingEnv: string[];
  redirectUri: string | null;
  connection: LinkedInConnection | null;
  checks: { token: LinkedInCheck; admin: LinkedInCheck; page: LinkedInCheck } | null;
  /** Zile până la expirarea tokenului de acces (fără refresh token trebuie reconectat înainte) */
  daysLeft: number | null;
}

const fail = (error: unknown): LinkedInCheck => ({ ok: false, detail: (error as Error).message.slice(0, 200) });

export async function linkedinStatus(orgId: string): Promise<LinkedInStatus> {
  const missingEnv = missingLinkedinEnv();
  const status: LinkedInStatus = { missingEnv, redirectUri: linkedinRedirectUri(), connection: null, checks: null, daysLeft: null };
  if (missingEnv.length > 0) return status;

  status.connection = await getConnection(orgId);
  if (!status.connection) return status;

  status.daysLeft = Math.floor((new Date(status.connection.access_expires_at).getTime() - Date.now()) / 86_400_000);
  const checks = {
    token: { ok: false, detail: 'neverificat' },
    admin: { ok: false, detail: 'neverificat' },
    page: { ok: false, detail: 'neverificat' },
  };
  status.checks = checks;

  let token: string;
  try {
    token = (await getAccessToken(orgId)).token;
    checks.token = { ok: true, detail: status.connection.member_name ? `autorizat de ${status.connection.member_name}` : 'valid' };
  } catch (error) {
    checks.token = fail(error);
    return status;
  }

  const orgUrn = linkedinOrgUrn()!;
  try {
    const orgs = await administeredOrganizations(token);
    checks.admin = orgs.includes(orgUrn)
      ? { ok: true, detail: 'ADMINISTRATOR aprobat' }
      : { ok: false, detail: 'contul conectat nu mai e admin al paginii' };
  } catch (error) {
    checks.admin = fail(error);
  }

  try {
    const { data } = await linkedin<{ localizedName?: string; vanityName?: string }>(`organizations/${orgUrn.split(':').pop()}`, { token });
    checks.page = { ok: true, detail: data.localizedName ?? data.vanityName ?? orgUrn };
  } catch (error) {
    // Unele versiuni cer URN-ul în cale; a doua încercare înainte de a raporta eroarea
    try {
      const { data } = await linkedin<{ localizedName?: string }>(`organizations/${encodeUrn(orgUrn)}`, { token });
      checks.page = { ok: true, detail: data.localizedName ?? orgUrn };
    } catch {
      checks.page = fail(error);
    }
  }
  return status;
}
