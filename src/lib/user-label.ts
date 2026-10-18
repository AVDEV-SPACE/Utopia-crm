import { currentUser } from '@clerk/nextjs/server';

/**
 * Numele afișabil al utilizatorului curent, pentru semnarea notelor.
 * Întoarce `null` dacă Clerk nu e disponibil — nota rămâne fără autor,
 * ceea ce e preferabil unei erori care ar bloca salvarea.
 */
export async function currentUserLabel(): Promise<string | null> {
  try {
    const user = await currentUser();
    if (!user) return null;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return name || user.emailAddresses[0]?.emailAddress || null;
  } catch {
    return null;
  }
}
