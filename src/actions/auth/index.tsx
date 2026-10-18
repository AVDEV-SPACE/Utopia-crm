// src/actions/auth/index.tsx
'use server';

import { auth } from '@clerk/nextjs/server';
import { sql } from '@/lib/neon-server';
import { isEmailAllowed, verifiedEmailsOf } from '@/lib/authorization';

/**
 * Sincronizează contul nou creat în `crm_users`.
 *
 * O acțiune de server e un endpoint POST public, deci nu are încredere în
 * argumente: contul trebuie să fie cel al sesiunii curente, emailul se citește
 * din Clerk (verificat), iar rolul cerut trebuie să fie permis de allowlist.
 * Altfel oricine ar putea crea rânduri sau schimba rolul altui utilizator.
 */
export async function onCompleteUserRegistration({
  fullname,
  clerkId,
  type,
}: {
  fullname: string;
  clerkId: string;
  type: 'owner' | 'assistant';
  /** Ignorat: emailul se ia din Clerk. Păstrat pentru compatibilitate cu apelantul. */
  email?: string;
}) {
  try {
    if (!clerkId || (type !== 'owner' && type !== 'assistant')) {
      return { status: 400, error: 'Date de înregistrare invalide' };
    }

    const { userId } = await auth();
    if (!userId || userId !== clerkId) {
      return { status: 403, error: 'Sesiune invalidă pentru acest cont' };
    }

    let allowedEmail: string | null = null;
    for (const email of await verifiedEmailsOf(clerkId)) {
      if (await isEmailAllowed(email, type)) {
        allowedEmail = email;
        break;
      }
    }
    if (!allowedEmail) {
      return { status: 403, error: 'Acest email nu este autorizat pentru rolul ales' };
    }

    const result = await sql`
      INSERT INTO crm_users (clerk_id, fullname, role, email)
      VALUES (${clerkId}, ${fullname?.trim() || 'User'}, ${type}, ${allowedEmail})
      ON CONFLICT (clerk_id) DO UPDATE SET
        fullname = EXCLUDED.fullname,
        role = EXCLUDED.role,
        email = EXCLUDED.email
      RETURNING *
    `;

    if (result.length === 0) {
      console.error('Eroare la înregistrare: niciun rând returnat');
      return { status: 400, error: 'Failed to create/update user' };
    }

    return { status: 200, user: result[0] };
  } catch (error: unknown) {
    console.error('Eroare la sincronizarea utilizatorului:', error instanceof Error ? error.message : error);
    return { status: 500, error: 'Internal Server Error' };
  }
}
