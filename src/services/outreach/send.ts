import { isEmailConfigured, sendEmail } from '@/lib/messaging';
import { engineOrgId } from '@/services/engine/run';
import { sleep } from '@/services/engine/http';
import { logSentMessages } from '@/services/messages/repository';
import { logPipelineEvent } from '@/services/pipeline/repository';
import { STAGE_RANK, TERMINAL_STAGES } from '@/services/pipeline/stages';
import { resolveStepContent, type StepContent } from './content';
import { composeOutreachEmail, trackingBaseUrl } from './email';
import { canReceiveEmail } from './mx';
import { claimDueEmailTasks, countSentToday, getEmailSendCap, markTaskFailed, markTaskSent, stopSequence, type ClaimedEmailTask } from './repository';
import { allowedRecipients, dailyCap, isSendingEnabled, sendWindowBlock } from './schedule';
import { getTemplates } from './templates';
import type { SendResult } from './types';

/** Maximum de emailuri pe rulare: rulările la 10 minute dau pauze naturale. */
const MAX_PER_RUN = 2;

/** Lead-ul a răspuns sau e într-o etapă finală: secvența nu mai trimite nimic. */
export function stopsSequence(stage: string | null): boolean {
  if (!stage) return false;
  return TERMINAL_STAGES.has(stage) || (STAGE_RANK[stage] ?? 0) >= STAGE_RANK.REPLIED;
}

/**
 * O rulare de trimitere: în intervalele din `schedule.ts`, maximum 2 emailuri,
 * în limita plafonului zilnic (cu creșterea treptată din primele săptămâni).
 * Garda pe etape se verifică la fiecare pas, imediat înainte de trimitere.
 * Template-urile se randează acum, deci o editare a template-ului se vede și în
 * pașii planificați înainte.
 */
export async function runOutreachSend(requestOrigin: string): Promise<SendResult> {
  const result: SendResult = { sent: 0, failed: 0, cancelled: 0, sentToday: 0, cap: dailyCap('email'), errors: [] };

  if (!isSendingEnabled()) return { ...result, skipped: 'OUTREACH_SEND_ENABLED nu este true' };
  const blocked = sendWindowBlock();
  if (blocked) return { ...result, skipped: blocked };

  if (!isEmailConfigured()) return { ...result, skipped: 'Email neconfigurat (GMAIL_APP_PASSWORD)' };

  result.cap = await getEmailSendCap();
  result.sentToday = await countSentToday('email');
  const room = Math.min(MAX_PER_RUN, result.cap - result.sentToday);
  if (room <= 0) return { ...result, skipped: `plafonul zilnic de ${result.cap} emailuri e atins` };

  const tasks = await claimDueEmailTasks(room, allowedRecipients());
  const templates = await getTemplates(tasks.map((t) => t.template_id).filter((id): id is number => id !== null));
  const baseUrl = trackingBaseUrl(requestOrigin);

  for (const [index, task] of tasks.entries()) {
    if (stopsSequence(task.pipeline_stage)) {
      result.cancelled += await stopSequence(task.lead_id, 'cancelled');
      continue;
    }
    if (!task.contact_email) {
      await markTaskFailed(task.id, 'Lead-ul nu mai are adresă de email');
      result.failed++;
      continue;
    }
    // O adresă pe un domeniu fără server de email ar fi o respingere sigură
    if (!(await canReceiveEmail(task.contact_email))) {
      const error = 'Domeniul adresei nu primește email (fără înregistrare MX)';
      await markTaskFailed(task.id, error);
      result.cancelled += await stopSequence(task.lead_id, 'cancelled');
      result.failed++;
      result.errors.push(`${task.company_name}: ${error}`);
      continue;
    }

    const content = resolveStepContent({
      step: task.step,
      templateId: task.template_id,
      template: task.template_id !== null ? templates.get(task.template_id) : null,
      aiSubject: task.subject,
      aiMessage: task.message,
      firstSubject: task.first_subject,
      lead: task,
    });
    if ('error' in content) {
      await markTaskFailed(task.id, content.error);
      result.failed++;
      result.errors.push(`${task.company_name}: ${content.error}`);
      continue;
    }

    // Pauză între cele două emailuri ale rulării, ca trimiterile să nu fie lipite
    if (index > 0) await sleep(2_000 + Math.floor(Math.random() * 4_000));

    const email = composeOutreachEmail({ body: content.body, html: content.html, token: task.tracking_token, baseUrl });
    const thread = task.thread_ids ?? [];

    let messageId: string;
    try {
      messageId = await sendEmail(task.contact_email, content.subject, email.html, {
        text: email.text,
        fromName: process.env.OUTREACH_SENDER_NAME?.trim() || undefined,
        inReplyTo: thread[thread.length - 1],
        references: thread.length > 0 ? thread : undefined,
        headers: email.headers,
      });
    } catch (err) {
      const message = (err as Error).message;
      await markTaskFailed(task.id, message);
      result.failed++;
      result.errors.push(`${task.company_name}: ${message}`);
      await logOutcome(task, content, email.html, null, message).catch(() => {});
      continue;
    }

    const sentAt = new Date();
    await markTaskSent(task, messageId, sentAt, content.subject);
    result.sent++;
    result.sentToday++;

    // Jurnalele nu au voie să transforme un email plecat într-un eșec
    try {
      await logPipelineEvent(
        {
          key: task.source_ref,
          email: task.contact_email,
          channel: 'email',
          event: 'email_sent',
          stage: 'CONTACTED',
          campaignId: `outreach-pas-${task.step}`,
          replyText: null,
          occurredAt: sentAt,
          payload: { taskId: task.id, step: task.step, messageId, templateId: task.template_id },
        },
        task.lead_id
      );
      await logOutcome(task, content, email.html, messageId, null);
    } catch (err) {
      result.errors.push(`${task.company_name}: jurnal — ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * `sent_messages` (jurnalul „Mesaje trimise”). Message-ID-ul de aici e cel
 * după care sincronizarea Gmail leagă răspunsul de pasul de outreach.
 */
async function logOutcome(task: ClaimedEmailTask, content: StepContent, html: string, messageId: string | null, error: string | null) {
  await logSentMessages({ orgId: task.org_id ?? engineOrgId(), userId: 'outreach' }, [
    {
      channel: 'email',
      recipient_type: 'lead',
      lead_id: task.lead_id,
      recipient_name: task.company_name,
      recipient_email: task.contact_email,
      template_id: task.template_id !== null ? String(task.template_id) : null,
      template_title: `Outreach pasul ${task.step} — ${content.templateTitle ?? 'AI'}`,
      subject: content.subject,
      body: html,
      status: error ? 'failed' : 'sent',
      error,
      message_id: messageId,
    },
  ]);
}
