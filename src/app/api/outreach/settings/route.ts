import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isEmailConfigured } from '@/lib/messaging';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { senderFooter } from '@/services/outreach/email';
import { getOutreachStats, listPreviewLeads } from '@/services/outreach/repository';
import { dailyCap, isSendingEnabled, sendWindowBlock } from '@/services/outreach/schedule';
import { getOutreachSettings, getTemplates, updateOutreachSettings } from '@/services/outreach/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/** Panoul „Outreach email” din /pipeline: modelul fiecărui pas, starea trimiterii, leaduri pentru preview. */
export async function GET() {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    const [settings, stats, previewLeads] = await Promise.all([getOutreachSettings(), getOutreachStats(), listPreviewLeads(30)]);
    return NextResponse.json(
      {
        settings,
        stats,
        previewLeads: previewLeads.map((l) => ({ id: l.id, name: l.company_name, location: l.location, hasPitch: Boolean(l.pitch_generated) })),
        status: {
          enabled: isSendingEnabled(),
          footer: Boolean(senderFooter()),
          emailConfigured: isEmailConfigured(),
          windowBlock: sendWindowBlock(),
          cap: dailyCap('email'),
          testMode: Boolean(process.env.OUTREACH_ALLOWED_RECIPIENTS?.trim()),
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Outreach: citirea setărilor a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

const templateId = z.number().int().positive().nullable();
const bodySchema = z.object({
  step1_template_id: templateId,
  step2_template_id: templateId,
  step3_template_id: templateId,
});

export async function PUT(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  try {
    const ids = Object.values(parsed.data).filter((id): id is number => id !== null);
    const found = await getTemplates(ids);
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Template inexistent: #${missing.join(', #')}` }, { status: 400 });
    }
    return NextResponse.json({ settings: await updateOutreachSettings(parsed.data) });
  } catch (error) {
    console.error('Outreach: salvarea setărilor a eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
