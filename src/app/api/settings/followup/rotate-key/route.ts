import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant';
import { rotateApiKey } from '@/services/followups/settings';
import { buildSettingsResponse } from '@/services/followups/response';

export const dynamic = 'force-dynamic';

/**
 * Regenerează API key-ul organizației. Cheia veche devine imediat invalidă,
 * deci site-urile care o folosesc trebuie actualizate.
 */
export async function POST() {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const settings = await rotateApiKey(tenant.orgId);
    return NextResponse.json(buildSettingsResponse(settings));
  } catch (error) {
    console.error('[settings/followup/rotate-key] error:', error);
    return NextResponse.json({ error: 'Nu am putut regenera cheia API' }, { status: 500 });
  }
}
