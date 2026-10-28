import { isHtmlContent, renderTemplate, type TemplateLead } from './templates';
import type { OutreachTemplate } from './types';

/** Conținutul final al unui pas de email, înainte de semnătură și tracking. */
export interface StepContent {
  subject: string;
  body: string;
  html: boolean;
  /** Titlul template-ului folosit; `null` = text AI */
  templateTitle: string | null;
}

/** Follow-up-urile răspund în firul pasului 1; „Re:” nu se dublează. */
const replySubject = (subject: string) => `Re: ${subject.replace(/^(re:\s*)+/i, '')}`;

/**
 * Același calcul la trimitere și în preview, ca preview-ul să arate exact ce
 * pleacă. `firstSubject` = subiectul cu care a plecat pasul 1 (pentru 2–3).
 */
export function resolveStepContent(input: {
  step: number;
  templateId: number | null;
  template: OutreachTemplate | null | undefined;
  aiSubject: string | null;
  aiMessage: string | null;
  firstSubject: string | null;
  lead: TemplateLead;
}): StepContent | { error: string } {
  const { step, lead } = input;

  if (input.templateId !== null) {
    if (!input.template) return { error: 'Template-ul ales pentru acest pas a fost șters' };
    const ownSubject = renderTemplate(input.template.title, lead, false).trim();
    return {
      subject: step > 1 && input.firstSubject ? replySubject(input.firstSubject) : ownSubject,
      body: renderTemplate(input.template.content, lead),
      html: isHtmlContent(input.template.content),
      templateTitle: input.template.title,
    };
  }

  if (!input.aiMessage?.trim()) return { error: 'Pasul nu are conținut (nici template, nici text AI)' };
  const ownSubject = input.aiSubject?.trim() || `Pentru ${lead.company_name}`;
  return {
    subject: step > 1 && input.firstSubject ? replySubject(input.firstSubject) : ownSubject,
    body: input.aiMessage,
    html: false,
    templateTitle: null,
  };
}
