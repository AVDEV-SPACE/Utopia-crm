import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { syncEmailReplies } from '@/services/messages/replies';

export const dynamic = 'force-dynamic';
// IMAP are nevoie de socket-uri TCP — nu rulează pe Edge
export const runtime = 'nodejs';

/**
 * POST /api/sent-messages/replies — caută în Gmail răspunsuri la emailurile
 * trimise și le marchează în jurnal. `?force=1` ignoră limita de frecvență
 * (butonul „Reîmprospătează”); deschiderea tabelului o respectă.
 */
export async function POST(req: NextRequest) {
  const tenant = await getTenantContext();
  if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

  try {
    const force = new URL(req.url).searchParams.get('force') === '1';
    const result = await syncEmailReplies(tenant.orgId, { force });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Sincronizarea răspunsurilor a eșuat:', error);
    const err = error as { authenticationFailed?: boolean; code?: string; message?: string };
    const message = err.authenticationFailed
      ? 'Gmail a refuzat autentificarea IMAP. Verifică GMAIL_APP_PASSWORD și că IMAP e activat în Gmail.'
      : err.code === '42703'
        ? 'Lipsesc coloanele pentru răspunsuri. Rulează setup-db-sent-messages-replies.sql în Neon.'
        : 'Nu am putut verifica răspunsurile din Gmail.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
