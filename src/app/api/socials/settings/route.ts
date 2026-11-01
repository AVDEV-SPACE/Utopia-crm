import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSocialAccess } from '@/lib/social-auth';
import { updateSettings } from '@/services/followups/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ social_ai_enabled: z.boolean() });

/** Comutatorul auto-reply-ului AI pe DM-urile Facebook / Instagram. */
export async function PUT(req: NextRequest) {
  const access = await requireSocialAccess();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Body invalid: { social_ai_enabled: boolean }' }, { status: 400 });

  try {
    const settings = await updateSettings(access.orgId, { social_ai_enabled: parsed.data.social_ai_enabled });
    return NextResponse.json({ social_ai_enabled: settings.social_ai_enabled });
  } catch (error) {
    console.error('[socials/settings] salvarea a eșuat:', error);
    const code = (error as { code?: string }).code;
    const message = code === '42P01' || code === '42703' ? 'Rulează setup-db-socials.sql în Neon' : 'Nu am putut salva setarea';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
