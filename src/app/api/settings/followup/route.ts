import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTenantContext } from '@/lib/tenant';
import { getOrCreateSettings, updateSettings } from '@/services/followups/settings';
import { buildSettingsResponse } from '@/services/followups/response';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const patchSchema = z.object({
  missed_call_sms_enabled: z.boolean().optional(),
  missed_call_sms_message: z.string().max(1000).optional(),
  whatsapp_ai_enabled: z.boolean().optional(),
  whatsapp_system_prompt: z.string().max(8000).optional(),
  human_takeover_minutes: z.number().int().min(0).max(1440).optional(),
});

export async function GET() {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const settings = await getOrCreateSettings(tenant.orgId);
    return NextResponse.json(buildSettingsResponse(settings), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('[settings/followup] GET error:', error);
    return NextResponse.json({ error: 'Nu am putut încărca setările' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const tenant = await getTenantContext();
    if (!tenant) return NextResponse.json({ error: 'Neautentificat' }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const settings = await updateSettings(tenant.orgId, parsed.data);
    return NextResponse.json(buildSettingsResponse(settings));
  } catch (error) {
    console.error('[settings/followup] PUT error:', error);
    return NextResponse.json({ error: 'Nu am putut salva setările' }, { status: 500 });
  }
}
