import { logPipelineEvent } from '@/services/pipeline/repository';
import { findTaskByToken, markOpened, stopSequence } from './repository';

/** Tokenurile generate de DB: 24 de octeți aleatori, în hex. */
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export const isTrackingToken = (token: string) => TOKEN_PATTERN.test(token);

/**
 * Prima deschidere a unui email trimis → eveniment `email_opened` + etapa
 * OPENED (doar dacă lead-ul nu a ajuns deja mai departe). Deschiderile
 * repetate nu mai scriu nimic.
 */
export async function recordOpen(token: string): Promise<void> {
  if (!isTrackingToken(token)) return;
  const task = await findTaskByToken(token);
  if (!task || task.channel !== 'email' || !task.sent_at) return;
  if (!(await markOpened(task.id))) return;

  await logPipelineEvent(
    {
      key: null,
      email: null,
      channel: 'email',
      event: 'email_opened',
      stage: 'OPENED',
      campaignId: `outreach-pas-${task.step}`,
      replyText: null,
      occurredAt: null,
      payload: { taskId: task.id, step: task.step },
    },
    task.lead_id
  );
}

/** Dezabonare: lead-ul devine DO_NOT_CONTACT și secvența se anulează. `false` = token necunoscut. */
export async function unsubscribe(token: string): Promise<boolean> {
  if (!isTrackingToken(token)) return false;
  const task = await findTaskByToken(token);
  if (!task) return false;

  await stopSequence(task.lead_id, 'cancelled');
  await logPipelineEvent(
    {
      key: null,
      email: null,
      channel: 'email',
      event: 'unsubscribed',
      stage: 'DO_NOT_CONTACT',
      campaignId: `outreach-pas-${task.step}`,
      replyText: null,
      occurredAt: null,
      payload: { taskId: task.id, step: task.step },
    },
    task.lead_id
  );
  return true;
}
