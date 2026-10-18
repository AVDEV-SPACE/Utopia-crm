import { auth, clerkClient } from '@clerk/nextjs/server';
import { sql } from '@/lib/neon';

/**
 * Autorizarea în CRM: un cont Clerk are acces doar dacă unul dintre emailurile
 * lui VERIFICATE e în allowlist (`allowed_owners` / `allowed_assistants`).
 *
 * Simpla existență a unui cont Clerk nu mai e suficientă: înscrierea e publică,
 * iar verificarea allowlist-ului din formularul de sign-up rulează în browser.
 * Emailul se citește din Clerk, nu din ce trimite clientul.
 */
export type AppRole = 'owner' | 'assistant';

const ROLE_TABLES: Record<AppRole, string> = {
  owner: 'allowed_owners',
  assistant: 'allowed_assistants',
};

/** Rezultatele se țin în memorie, ca middleware-ul să nu lovească Clerk + DB la fiecare request. */
const ALLOWED_TTL_MS = 5 * 60_000;
/** Refuzurile expiră repede, ca un email abia adăugat în allowlist să intre fără întârziere mare. */
const DENIED_TTL_MS = 30_000;
const roleCache = new Map<string, { role: AppRole | null; expires: number }>();

/** `true` dacă emailul e în allowlist-ul rolului. Tabela lipsă = nimeni autorizat. */
export async function isEmailAllowed(email: string, role: AppRole): Promise<boolean> {
  try {
    const rows = await sql.query(`SELECT 1 FROM ${ROLE_TABLES[role]} WHERE LOWER(email) = $1 LIMIT 1`, [
      email.trim().toLowerCase(),
    ]);
    return rows.length > 0;
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') return false; // undefined_table
    throw error;
  }
}

/** Rolul unui email conform allowlist-ului; owner are prioritate. */
export async function roleForEmail(email: string): Promise<AppRole | null> {
  if (await isEmailAllowed(email, 'owner')) return 'owner';
  if (await isEmailAllowed(email, 'assistant')) return 'assistant';
  return null;
}

/** Emailurile verificate ale unui cont Clerk, cu litere mici. */
export async function verifiedEmailsOf(userId: string): Promise<string[]> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return user.emailAddresses
    .filter((e) => e.verification?.status === 'verified')
    .map((e) => e.emailAddress.toLowerCase());
}

/** Rolul utilizatorului autentificat, sau `null` dacă nu e autorizat în CRM. */
export async function resolveUserRole(userId: string): Promise<AppRole | null> {
  const cached = roleCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.role;

  let role: AppRole | null = null;
  for (const email of await verifiedEmailsOf(userId)) {
    role = await roleForEmail(email);
    if (role) break;
  }

  roleCache.set(userId, { role, expires: Date.now() + (role ? ALLOWED_TTL_MS : DENIED_TTL_MS) });
  return role;
}

/**
 * Pentru handler-ele de pe rute publice în middleware (ex. /api/leads, care
 * primește și lead-uri din site cu API key): userId-ul doar dacă sesiunea e a
 * unui utilizator autorizat în CRM, altfel `null`.
 */
export async function authorizedUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  try {
    return (await resolveUserRole(userId)) ? userId : null;
  } catch {
    return null;
  }
}
