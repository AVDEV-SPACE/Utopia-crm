import { GroqRateLimitError } from '@/services/engine/groq';
import { generateFollowups } from './ai';
import { htmlToText } from './email';
import { countPlannedToday, insertSequence, listPlanCandidates, type NewStep, type PlanCandidate } from './repository';
import { dailyCap, STEP_OFFSET_DAYS } from './schedule';
import { getOutreachSettings, getTemplates, isHtmlContent, renderTemplate, templateForStep } from './templates';
import type { OutreachChannel, OutreachSettings, OutreachTemplate, PlanResult } from './types';

/** Câte leaduri încercăm pe rulare (fiecare poate cere un apel Groq, ~3–5s). */
const MAX_CANDIDATES_PER_RUN = 30;

interface FirstStep {
  channel: OutreachChannel;
  templateId: number | null;
  subject: string | null;
  message: string | null;
  /** Textul pasului 1, dat AI-ului ca să scrie follow-up-uri coerente cu el */
  contextText: string;
}

/**
 * Primul pas: email (template-ul ales sau pitch-ul AI) → Instagram → LinkedIn.
 * Pe DM-uri (trimise manual, Faza 3) rămâne mesajul AI.
 */
function firstStep(lead: PlanCandidate, settings: OutreachSettings, templates: Map<number, OutreachTemplate>): FirstStep | null {
  if (lead.contact_email) {
    const templateId = templateForStep(settings, 1);
    const template = templateId !== null ? templates.get(templateId) : undefined;
    if (template) {
      const body = renderTemplate(template.content, lead);
      return {
        channel: 'email',
        templateId: template.id,
        subject: null, // se calculează la trimitere, din titlul template-ului
        message: null,
        contextText: isHtmlContent(template.content) ? htmlToText(body) : body,
      };
    }
    if (lead.pitch_generated) {
      return { channel: 'email', templateId: null, subject: lead.pitch_subject, message: lead.pitch_generated, contextText: lead.pitch_generated };
    }
  }
  if (lead.contact_instagram && lead.instagram_dm) {
    return { channel: 'instagram', templateId: null, subject: null, message: lead.instagram_dm, contextText: lead.instagram_dm };
  }
  if (lead.linkedin && lead.linkedin_dm) {
    return { channel: 'linkedin', templateId: null, subject: null, message: lead.linkedin_dm, contextText: lead.linkedin_dm };
  }
  return null;
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/**
 * Generatorul de secvențe: pentru fiecare lead din coadă (ICP, fără pași)
 * creează pașii 1–3 pe canalul ales. Pe email, fiecare pas folosește
 * template-ul ales în /pipeline sau, fără template, AI-ul (pitch-ul lead-ului
 * la pasul 1, follow-up-uri Groq la 2–3). Groq se cheamă doar dacă cel puțin
 * un follow-up e pe AI. Respectă plafonul zilnic pe canal, ca să nu se strângă
 * în coadă mai multe secvențe decât se pot trimite.
 *
 * Alegerea template-urilor se aplică secvențelor planificate de acum; editarea
 * conținutului unui template se vede și în pașii deja planificați.
 */
export async function runOutreachPlan(budgetMs: number): Promise<PlanResult> {
  const deadline = Date.now() + budgetMs;
  const result: PlanResult = { candidates: 0, planned: 0, deferred: 0, errors: [] };

  const [settings, plannedToday] = await Promise.all([getOutreachSettings(), countPlannedToday()]);
  const room: Record<OutreachChannel, number> = {
    email: Math.max(dailyCap('email') - plannedToday.email, 0),
    instagram: Math.max(dailyCap('instagram') - plannedToday.instagram, 0),
    linkedin: Math.max(dailyCap('linkedin') - plannedToday.linkedin, 0),
  };
  if (room.email + room.instagram + room.linkedin === 0) {
    return { ...result, stoppedReason: 'plafoanele zilnice de planificare sunt atinse' };
  }

  const chosen = [1, 2, 3].map((step) => templateForStep(settings, step)).filter((id): id is number => id !== null);
  const templates = await getTemplates(chosen);

  const candidates = await listPlanCandidates(MAX_CANDIDATES_PER_RUN);
  result.candidates = candidates.length;

  for (const lead of candidates) {
    if (Date.now() > deadline - 8_000) {
      result.stoppedReason = 'bugetul de timp al rulării s-a terminat';
      break;
    }

    const first = firstStep(lead, settings, templates);
    if (!first) {
      result.deferred++;
      continue;
    }
    if (room[first.channel] <= 0) continue;

    // Pașii 2–3: template doar pe email; pe DM-uri, mereu AI
    const followupTemplate = (step: number) => {
      if (first.channel !== 'email') return null;
      const id = templateForStep(settings, step);
      return id !== null && templates.has(id) ? id : null;
    };
    const t2 = followupTemplate(2);
    const t3 = followupTemplate(3);

    let ai: { step2: string; step3: string } | null = null;
    if (t2 === null || t3 === null) {
      try {
        ai = await generateFollowups(
          {
            firma: lead.company_name,
            nisa: lead.niche,
            oras: lead.location,
            canal: first.channel,
            subiect_initial: first.subject,
            mesaj_initial: first.contextText,
          },
          deadline
        );
      } catch (err) {
        if (err instanceof GroqRateLimitError) {
          result.stoppedReason = err.message;
          break;
        }
        result.deferred++;
        result.errors.push(`${lead.company_name}: ${(err as Error).message}`);
        continue;
      }
    }

    const now = new Date();
    // Subiectele follow-up-urilor („Re: …”) se calculează la trimitere, din pasul 1 trimis
    const steps: NewStep[] = [
      { step: 1, templateId: first.templateId, subject: first.subject, message: first.message, dueAt: now },
      { step: 2, templateId: t2, subject: null, message: t2 === null ? ai!.step2 : null, dueAt: addDays(now, STEP_OFFSET_DAYS[2]) },
      { step: 3, templateId: t3, subject: null, message: t3 === null ? ai!.step3 : null, dueAt: addDays(now, STEP_OFFSET_DAYS[3]) },
    ];

    try {
      const inserted = await insertSequence(lead.id, first.channel, steps);
      if (inserted > 0) {
        result.planned++;
        room[first.channel]--;
      }
    } catch (err) {
      result.errors.push(`${lead.company_name}: ${(err as Error).message}`);
    }
  }

  return result;
}
