import { auth } from '@clerk/nextjs/server';

/**
 * Cheia de tenant a modulelor multi-tenant.
 *
 * Când organizațiile Clerk sunt activate, e chiar `orgId`. Când nu sunt (sau
 * userul lucrează în spațiul personal), folosim `user:<clerkUserId>` — astfel
 * fiecare cont are propriile setări și propriul API key, iar activarea
 * ulterioară a organizațiilor nu invalidează datele existente.
 */
export function tenantIdFor(orgId: string | null | undefined, userId: string): string {
  return orgId ?? `user:${userId}`;
}

export interface TenantContext {
  orgId: string;
  userId: string;
}

/** Tenant-ul requestului curent, sau `null` dacă utilizatorul nu e autentificat. */
export async function getTenantContext(): Promise<TenantContext | null> {
  const { userId, orgId } = await auth();
  if (!userId) return null;
  return { orgId: tenantIdFor(orgId, userId), userId };
}
