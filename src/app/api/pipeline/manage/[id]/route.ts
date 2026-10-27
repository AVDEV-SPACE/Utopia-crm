import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { currentUserLabel } from '@/lib/user-label';
import { logStatusChange } from '@/services/leads/notes';
import { getPipelineLead, setManualStage } from '@/services/pipeline/repository';
import { PIPELINE_STAGES } from '@/services/pipeline/stages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

const idSchema = z.string().uuid('Id invalid');

/** Fișa lead-ului + istoricul evenimentelor. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: 'Id invalid' }, { status: 400 });

    const result = await getPipelineLead(id.data);
    if (!result) return NextResponse.json({ error: 'Lead negăsit' }, { status: 404 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    console.error('Pipeline: citirea lead-ului a eșuat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const patchSchema = z.object({
  stage: z.enum(PIPELINE_STAGES, { message: 'Etapă necunoscută' }),
});

/** Etapă setată manual. Scrie și un eveniment `channel:'manual'`. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  try {
    const id = idSchema.safeParse((await params).id);
    if (!id.success) return NextResponse.json({ error: 'Id invalid' }, { status: 400 });

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    const authorName = await currentUserLabel();
    const result = await setManualStage(id.data, parsed.data.stage, { id: access.userId, name: authorName });

    if (!result.ok) {
      return result.reason === 'not_found'
        ? NextResponse.json({ error: 'Lead negăsit' }, { status: 404 })
        : NextResponse.json(
            { error: 'Etapa nu poate coborî. Doar WON, LOST și DO_NOT_CONTACT se pot seta oricând.' },
            { status: 409 }
          );
    }

    if (result.previousStage !== result.lead.pipeline_stage) {
      await logStatusChange({
        leadId: result.lead.id,
        orgId: result.lead.org_id,
        authorId: access.userId,
        authorName,
        from: result.previousStage ?? '—',
        to: result.lead.pipeline_stage ?? '—',
      });
    }

    const detail = await getPipelineLead(id.data);
    return NextResponse.json(detail);
  } catch (error) {
    console.error('Pipeline: schimbarea etapei a eșuat:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
