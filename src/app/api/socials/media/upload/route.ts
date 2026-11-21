import { NextRequest, NextResponse } from 'next/server';
import { requireSocialAccess } from '@/lib/social-auth';
import { mediaStore } from '@/services/media/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tokenul de upload direct din browser în store (tipurile și mărimea permise
 * sunt fixate în token, pe tipul fișierului). Fișierul nu trece prin funcție;
 * după upload, browserul îl înregistrează prin POST /api/socials/media.
 */
export async function POST(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const store = mediaStore();
  if (!store.configured) {
    return NextResponse.json({ error: 'Stocarea media nu e configurată (BLOB_READ_WRITE_TOKEN lipsește)' }, { status: 503 });
  }

  try {
    return NextResponse.json(await store.handleClientUpload(req, await req.json()));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || 'Upload refuzat' }, { status: 400 });
  }
}
