import { GroqRateLimitError } from '@/services/engine/groq';
import { engineOrgId } from '@/services/engine/run';
import { fetchInboundEmails, syncEmailReplies } from '@/services/messages/replies';
import { logPipelineEvent } from '@/services/pipeline/repository';
import { statusForStage } from '@/services/pipeline/stages';
import { classifyReply, stageForIntent } from './ai';
import {
  listAwaitingReplyOrgs,
  listEmailContacts,
  listRecordedReplyIds,
  markLeadRepliesHandled,
  postponeSequence,
  restoreLeadStatus,
  stopSequence,
  type EmailContact,
} from './repository';
import type { InboxSyncResult, ReplyIntent } from './types';

/** Câte răspunsuri procesăm pe rulare (fiecare cere un apel Groq). */
const MAX_REPLIES_PER_RUN = 25;

/** Un răspuns automat (concediu) amână secvența cu atâtea zile. */
const OUT_OF_OFFICE_DELAY_DAYS = 3;

/** Intențiile cu care un răspuns nou scoate lead-ul din LOST (s-a răzgândit, întreabă). */
const REOPENING_INTENTS = new Set<ReplyIntent>(['interested', 'question', 'objection']);

/**
 * Răspunsurile leadurilor pe email. Două etape:
 * 1. sincronizarea Gmail existentă (`syncEmailReplies`, ca în „Mesaje trimise”)
 *    marchează primul răspuns la fiecare email trimis;
 * 2. fiecare email primit de la un lead contactat — inclusiv mesajele
 *    următoare din același fir — devine un eveniment `reply_received` cu textul
 *    lui (conversația din „Istoric”), clasificat cu Groq:
 *    - răspuns automat → secvența se amână, lead-ul rămâne în etapa lui;
 *    - altfel → secvența se oprește, lead-ul trece în REPLIED / INTERESTED /
 *      LOST / DO_NOT_CONTACT, după intenție. Un răspuns nou de interes îl
 *      scoate din LOST.
 */
export async function runInboxSync(budgetMs: number): Promise<InboxSyncResult> {
  const deadline = Date.now() + budgetMs;
  const result: InboxSyncResult = { checked: 0, matched: 0, processed: 0, outOfOffice: 0, errors: [] };

  const orgs = new Set([engineOrgId(), ...(await listAwaitingReplyOrgs())]);
  for (const orgId of orgs) {
    const sync = await syncEmailReplies(orgId, { force: true });
    result.checked += sync.checked;
    result.matched += sync.matched;
  }

  const contacts = await listEmailContacts();
  if (contacts.length === 0) return result;

  // O adresă folosită de mai multe leaduri: mesajul merge la cel contactat cel mai recent
  const byEmail = new Map<string, EmailContact>();
  for (const contact of contacts) {
    const current = byEmail.get(contact.email);
    if (!current || new Date(contact.last_sent_at) > new Date(current.last_sent_at)) byEmail.set(contact.email, contact);
  }
  const since = new Date(Math.min(...contacts.map((c) => new Date(c.first_sent_at).getTime())));
  const recorded = await listRecordedReplyIds(contacts.map((c) => c.lead_id));

  const inbound = (await fetchInboundEmails(Array.from(byEmail.keys()), since, recorded))
    .filter((email) => {
      const contact = byEmail.get(email.from);
      return contact !== undefined && email.date > new Date(contact.first_sent_at);
    })
    .slice(0, MAX_REPLIES_PER_RUN);

  let aiAvailable = true;
  for (const email of inbound) {
    if (Date.now() > deadline - 8_000) {
      result.errors.push('bugetul de timp al rulării s-a terminat');
      break;
    }
    const contact = byEmail.get(email.from)!;

    // Lead-ul a răspuns: niciun follow-up nu mai pleacă, indiferent de clasificare
    // (la un răspuns automat, secvența e reluată mai jos prin amânare).
    // Fără AI, mesajul rămâne neînregistrat și se reia la rularea următoare.
    if (!aiAvailable) {
      await stopSequence(contact.lead_id, 'replied');
      continue;
    }
    let intent: ReplyIntent | null = null;
    let summary: string | null = null;
    try {
      ({ intent, summary } = await classifyReply({ subject: email.subject, text: email.text }, deadline));
    } catch (err) {
      if (err instanceof GroqRateLimitError) {
        aiAvailable = false;
        await stopSequence(contact.lead_id, 'replied');
        result.errors.push(err.message);
        continue;
      }
      result.errors.push(`clasificare: ${(err as Error).message}`);
    }

    try {
      const outOfOffice = intent === 'out_of_office';
      if (outOfOffice) {
        await postponeSequence(contact.lead_id, OUT_OF_OFFICE_DELAY_DAYS);
        await restoreLeadStatus(contact.lead_id, statusForStage(contact.pipeline_stage));
        result.outOfOffice++;
      } else {
        await stopSequence(contact.lead_id, 'replied');
      }
      await logPipelineEvent(
        {
          key: contact.source_ref,
          email: email.from,
          channel: 'email',
          event: outOfOffice ? 'auto_reply' : 'reply_received',
          stage: outOfOffice ? null : stageForIntent(intent) ?? 'REPLIED',
          campaignId: null,
          replyText: email.text || null,
          occurredAt: email.date,
          payload: { replyMessageId: email.messageId, subject: email.subject, intent, summary },
          reopen: intent !== null && REOPENING_INTENTS.has(intent),
        },
        contact.lead_id
      );
      await markLeadRepliesHandled(contact.lead_id, intent);
      result.processed++;
    } catch (err) {
      result.errors.push(`răspuns ${email.messageId}: ${(err as Error).message}`);
    }
  }

  return result;
}
