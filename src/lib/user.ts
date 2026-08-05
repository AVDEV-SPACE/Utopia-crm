// src/lib/user.ts
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;
const sql = connectionString ? neon(connectionString) : null;

export interface UserRole {
  role: string;
}

export async function getUserRole(): Promise<UserRole | null> {
  if (!sql) {
    return null;
  }

  const { userId } = await (await import('@clerk/nextjs/server')).auth();

  if (!userId) {
    return null;
  }

  try {
    const result = await sql`SELECT role FROM crm_users WHERE clerk_id = ${userId}`;
    if (result.length === 0) return null;
    return { role: result[0].role };
  } catch (error) {
    console.error("Error fetching user role from DB:", error);
    return null;
  }
}