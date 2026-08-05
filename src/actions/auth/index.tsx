// src/actions/auth/index.tsx
'use server';

import { sql } from '@/lib/neon-server';

export async function onCompleteUserRegistration({
  fullname,
  clerkId,
  type,
  email,
}: {
  fullname: string;
  clerkId: string;
  type: 'owner' | 'assistant';
  email: string;
}) {
  try {
    if (!clerkId || !email) {
      return { status: 400, error: 'Missing required fields (clerkId or email)' };
    }

    console.log(`Sincronizare DB inițiată pentru: ${clerkId}`);

    const result = await sql`
      INSERT INTO crm_users (clerk_id, fullname, role, email)
      VALUES (${clerkId}, ${fullname || 'User'}, ${type}, ${email.toLowerCase()})
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

    const data = result[0];
    console.log('Utilizator salvat/actualizat cu succes:', data.id);
    return { status: 200, user: data };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Eroare critică în Action:', message);
    return { status: 500, error: message };
  }
}

export async function getUserRole(clerkId: string): Promise<string> {
  try {
    if (!clerkId) {
      console.warn('getUserRole apelat fără clerkId');
      return 'owner';
    }

    const result = await sql`
      SELECT role FROM crm_users WHERE clerk_id = ${clerkId} LIMIT 1
    `;

    if (result.length === 0) {
      console.warn(`Niciun user găsit pentru clerkId: ${clerkId} — fallback la 'owner'`);
      return 'owner';
    }

    console.log(`Rol găsit pentru ${clerkId}: ${result[0].role}`);
    return result[0].role as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`getUserRole eșuat pentru ${clerkId}:`, message);
    return 'owner';
  }
}