import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePipelineOwner } from '@/lib/pipeline-auth';
import { resolveStepContent } from '@/services/outreach/content';
import { composeOutreachEmail, senderFooter, trackingBaseUrl } from '@/services/outreach/email';
import { getPlannedStep, getPreviewLead, listPreviewLeads, type PreviewLead } from '@/services/outreach/repository';
import { getTemplates, renderTemplate } from '@/services/outreach/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const templateId = z.number().int().positive().nullable();
const bodySchema = z.object({
  step: z.number().int().min(1).max(3),
  templateId,
  /** Modelul pasului 1, pentru subiectul „Re: …” al follow-up-urilor */
  step1TemplateId: templateId,
  leadId: z.string().uuid().nullable(),
});

/** Lead fictiv când încă nu există leaduri cu email în coadă. */
const SAMPLE_LEAD: PreviewLead = {
  id: '',
  company_name: 'Clinica Exemplu',
  location: 'Oradea',
  niche: 'dentist',
  contact_email: null,
  pitch_subject: null,
  pitch_generated: null,
};

/** Token fictiv: linkurile din preview nu ating niciun lead real. */
const PREVIEW_TOKEN = '0'.repeat(48);

/**
 * Preview-ul unui pas, pe un lead real: același calcul ca la trimitere
 * (template randat sau text AI, subiect, semnătură, dezabonare).
 */
export async function POST(req: NextRequest) {
  const access = await requirePipelineOwner();
  if (access instanceof NextResponse) return access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Date invalide', details: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }
  const { step, templateId: chosen, step1TemplateId, leadId } = parsed.data;

  try {
    const lead = (leadId ? await getPreviewLead(leadId) : (await listPreviewLeads(1))[0]) ?? SAMPLE_LEAD;
    const templates = await getTemplates([chosen, step1TemplateId].filter((id): id is number => id !== null));

    // Subiectul pasului 1, de la care follow-up-urile răspund cu „Re: …”
    const step1Template = step1TemplateId !== null ? templates.get(step1TemplateId) : undefined;
    const firstSubject = step1Template
      ? renderTemplate(step1Template.title, lead, false)
      : lead.pitch_subject?.trim() || `Pentru ${lead.company_name}`;

    let aiSubject = lead.pitch_subject;
    let aiMessage = lead.pitch_generated;
    let note: string | null = null;
    if (chosen === null && step > 1) {
      // Follow-up-ul AI se scrie la planificare; arătăm varianta planificată, dacă există
      const planned = lead.id ? await getPlannedStep(lead.id, step) : null;
      aiSubject = null;
      aiMessage = planned?.template_id === null ? planned.message : null;
      if (!aiMessage) {
        return NextResponse.json({
          lead: lead.company_name,
          subject: `Re: ${firstSubject}`,
          html: null,
          text: null,
          note: 'Follow-up-ul AI se scrie la planificare, personalizat pe fiecare lead, pornind de la pasul 1. Pentru acest lead nu e încă planificat.',
        });
      }
      note = 'Follow-up-ul AI planificat pentru acest lead.';
    } else if (chosen === null && !aiMessage) {
      return NextResponse.json({
        lead: lead.company_name,
        subject: null,
        html: null,
        text: null,
        note: 'Leadul nu are încă pitch AI (rulează enrich) — alege alt lead sau un template.',
      });
    }

    const content = resolveStepContent({
      step,
      templateId: chosen,
      template: chosen !== null ? templates.get(chosen) : null,
      aiSubject,
      aiMessage,
      firstSubject: step > 1 ? firstSubject : null,
      lead,
    });
    if ('error' in content) return NextResponse.json({ error: content.error }, { status: 400 });

    const footer = senderFooter();
    const email = composeOutreachEmail({
      body: content.body,
      html: content.html,
      footer: footer ?? '[Semnătura PFA — setează OUTREACH_SENDER_FOOTER]',
      token: PREVIEW_TOKEN,
      baseUrl: trackingBaseUrl(req.nextUrl.origin),
    });

    return NextResponse.json({
      lead: lead.company_name,
      subject: content.subject,
      html: email.html,
      text: email.text,
      note: footer ? note : [note, 'Semnătura lipsește: fără OUTREACH_SENDER_FOOTER nu pleacă niciun email.'].filter(Boolean).join(' '),
    });
  } catch (error) {
    console.error('Outreach: preview eșuat:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
