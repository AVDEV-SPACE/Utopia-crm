import { timingSafeEqual } from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { resolveUserRole } from '@/lib/authorization';

/**
 * Autentificarea rutelor de import ale pipeline-ului (/api/pipeline/leads,
 * /api/pipeline/events). Sunt publice în middleware — uneltele externe n-au sesiune
 * Clerk — deci fiecare handler apelează asta înainte de orice altceva.
 *
 * Cheia vine din `x-api-key` sau `Authorization: Bearer <cheie>` și se compară
 * cu `CRM_PIPELINE_API_KEY` în timp constant. Întoarce `null` dacă cererea e
 * autorizată, altfel răspunsul de eroare gata de returnat.
 */
export function checkPipelineKey(req: NextRequest): NextResponse | null {
  const expected = process.env.CRM_PIPELINE_API_KEY;
  if (!expected) {
    console.error('Pipeline: CRM_PIPELINE_API_KEY nu este setat');
    return NextResponse.json({ error: 'Pipeline-ul nu este configurat pe server' }, { status: 500 });
  }

  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const provided = req.headers.get('x-api-key') ?? bearer ?? '';

  if (!safeEqual(provided.trim(), expected)) {
    return NextResponse.json({ error: 'API key lipsă sau invalid' }, { status: 401 });
  }
  return null;
}

/**
 * Rutele de UI ale pipeline-ului (/api/pipeline/manage) sunt deja sub Clerk +
 * allowlist în middleware; aici restrângem în plus la rolul `owner`, la fel ca
 * pagina /pipeline (pe care assistant-ul nu o vede). Middleware-ul nu poate
 * face asta pentru API: redirect-ul lui spre /appointments e pentru pagini.
 */
export async function requirePipelineOwner(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

  let role: Awaited<ReturnType<typeof resolveUserRole>> = null;
  try {
    role = await resolveUserRole(userId);
  } catch (error) {
    console.error('Pipeline: verificarea rolului a eșuat:', error);
  }
  if (role !== 'owner') return NextResponse.json({ error: 'Acces neautorizat' }, { status: 403 });
  return { userId };
}

/** Comparație în timp constant; lungimi diferite = nepotrivire. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
