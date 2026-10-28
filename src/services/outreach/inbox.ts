import { GroqRateLimitError } from '@/services/engine/groq';
import { engineOrgId } from '@/services/engine/run';
import { syncEmailReplies } from '@/services/messages/replies';
import { logPipelineEvent } from '@/services/pipeline/repository';
import { statusForStage } from '@/services/pipeline/stages';
import { classifyReply, stageForIntent } from './ai';
import { listUnhandledReplies, markReplyHandled, postponeSequence, restoreLeadStatus, stopSequence } from './repository';
import type { InboxSyncResult, ReplyIntent } from './types';

/** Câte răspunsuri procesăm pe rulare (fiecare cere un apel Groq). */
const MAX_REPLIES_PER_RUN = 25;

/** Un răspuns automat (concediu) amână secvența cu atâtea zile. */
const OUT_OF_OFFICE_DELAY_DAYS = 3;

/**
 * Răspunsurile la outreach. Detectarea o face sincronizarea Gmail existentă
 * (`syncEmailReplies`, aceeași ca în „Mesaje trimise”), care marchează
 * răspunsul în `sent_messages`. Aici fiecare răspuns nou la un pas de
 * outreach e clasificat cu Groq și:
 * - răspuns automat → secvența se amână, lead-ul rămâne în etapa lui;
 * - altfel → secvența se oprește, lead-ul trece în REPLIED / INTERESTED /
 *   LOST / DO_NOT_CONTACT, după intenție.
 */
export async function runInboxSync(budgetMs: number): Promise<InboxSyncResult> {
  const deadline = Date.now() + budgetMs;
  const result: InboxSyncResult = { checked: 0, matched: 0, processed: 0, outOfOffice: 0, errors: [] };

  const sync = await syncEmailReplies(engineOrgId(), { force: true });
  result.checked = sync.checked;
  result.matched = sync.matched;

  let aiAvailable = true;
  for (const reply of await listUnhandledReplies(MAX_REPLIES_PER_RUN)) {
    if (Date.now() > deadline - 8_000) {
      result.errors.push('bugetul de timp al rulării s-a terminat');
      break;
    }

    // Lead-ul a răspuns: niciun follow-up nu mai pleacă, indiferent de clasificare
    // (la un răspuns automat, secvența e reluată mai jos prin amânare)
    let intent: ReplyIntent | null = null;
    let summary: string | null = null;
    if (aiAvailable) {
      try {
        ({ intent, summary } = await classifyReply({ subject: reply.reply_subject, text: reply.reply_snippet ?? '' }, deadline));
      } catch (err) {
        if (err instanceof GroqRateLimitError) {
          // Fără AI: oprim secvența acum, clasificarea se reia la rularea următoare
          aiAvailable = false;
          await stopSequence(reply.lead_id, 'replied');
          result.errors.push(err.message);
          continue;
        }
        result.errors.push(`clasificare: ${(err as Error).message}`);
      }
    } else {
      await stopSequence(reply.lead_id, 'replied');
      continue;
    }

    try {
      if (intent === 'out_of_office') {
        await postponeSequence(reply.lead_id, OUT_OF_OFFICE_DELAY_DAYS);
        await restoreLeadStatus(reply.lead_id, statusForStage(reply.pipeline_stage));
        await logPipelineEvent(
          {
            key: reply.source_ref,
            email: reply.contact_email,
            channel: 'email',
            event: 'auto_reply',
            stage: null,
            campaignId: `outreach-pas-${reply.step}`,
            replyText: reply.reply_snippet,
            occurredAt: new Date(reply.replied_at),
            payload: { taskId: reply.task_id, intent, summary },
          },
          reply.lead_id
        );
        result.outOfOffice++;
      } else {
        await stopSequence(reply.lead_id, 'replied');
        await logPipelineEvent(
          {
            key: reply.source_ref,
            email: reply.contact_email,
            channel: 'email',
            event: 'reply_received',
            stage: stageForIntent(intent) ?? 'REPLIED',
            campaignId: `outreach-pas-${reply.step}`,
            replyText: reply.reply_snippet,
            occurredAt: new Date(reply.replied_at),
            payload: { taskId: reply.task_id, intent, summary },
          },
          reply.lead_id
        );
      }
      await markReplyHandled(reply.task_id, intent);
      result.processed++;
    } catch (err) {
      result.errors.push(`răspuns ${reply.task_id}: ${(err as Error).message}`);
    }
  }

  return result;
}
