import {
  appendSocialMessage,
  getOrCreateSocialConversation,
  setConversationLead,
} from '@/services/followups/conversations';
import { logPipelineEvent } from '@/services/pipeline/repository';
import { findOrCreateSocialLead } from '../leads';
import { encodeUrn, linkedin } from './api';
import { getAccessToken, recordSyncResult } from './tokens';

/**
 * Comentariile de la postările paginii LinkedIn în inbox-ul /socials.
 *
 * LinkedIn nu trimite webhook-uri pentru comentarii pe Development Tier, deci
 * le citim periodic (cron /api/cron/linkedin-sync). Fiecare comentator devine o
 * conversație (cheia: URN-ul persoanei) și un lead; comentariul e idempotent
 * după URN-ul lui. Mesaje directe nu există: API-ul nu le permite.
 *
 * Bugetul: Development Tier are ~500 de apeluri/zi pe aplicație. O rulare face
 * 1 + MAX_POSTS_PER_SYNC apeluri, deci cron-ul se programează din oră în oră.
 */

const MAX_POSTS_PER_SYNC = 5;
const COMMENTS_PER_POST = 50;

interface LinkedInComment {
  id?: string;
  commentUrn?: string;
  actor?: string;
  object?: string;
  parentComment?: string;
  message?: { text?: string };
  created?: { time?: number };
}

export interface LinkedInSyncResult {
  posts: number;
  comments: number;
  newComments: number;
  errors: string[];
}

/** Ultimele postări ale paginii (create din CRM sau direct pe LinkedIn). */
async function recentPostUrns(token: string, organizationUrn: string): Promise<string[]> {
  const { data } = await linkedin<{ elements?: { id?: string }[] }>('posts', {
    token,
    query: `q=author&author=${encodeUrn(organizationUrn)}&count=${MAX_POSTS_PER_SYNC}&sortBy=LAST_MODIFIED`,
    headers: { 'X-RestLi-Method': 'FINDER' },
  });
  return (data.elements ?? []).map((p) => p.id ?? '').filter(Boolean);
}

/** Un comentator LinkedIn: fără nume în API (doar URN-ul), deci un nume generic, stabil. */
function displayName(actorUrn: string): string {
  return `Membru LinkedIn ${actorUrn.split(':').pop()?.slice(-6) ?? ''}`.trim();
}

async function ingestComment(orgId: string, organizationUrn: string, postUrn: string, comment: LinkedInComment): Promise<boolean> {
  const actor = comment.actor;
  const urn = comment.commentUrn ?? (comment.id ? `urn:li:comment:(${postUrn},${comment.id})` : null);
  const text = comment.message?.text?.trim();
  // Comentariile paginii însăși (răspunsurile noastre) se salvează la trimitere, din CRM
  if (!actor || !urn || !text || actor === organizationUrn) return false;

  const occurredAt = comment.created?.time ? new Date(comment.created.time) : new Date();
  const conversation = await getOrCreateSocialConversation({ orgId, channel: 'linkedin', externalUserId: actor });
  const message = await appendSocialMessage({
    conversationId: conversation.id,
    role: 'user',
    body: text,
    externalId: urn,
    kind: 'comment',
    // Postarea, ca răspunsul nostru să ajungă în același fir
    externalParentId: comment.object ?? postUrn,
    createdAt: occurredAt,
  });
  if (!message) return false;

  let leadId = conversation.lead_id;
  if (!leadId) {
    const name = displayName(actor);
    const lead = await findOrCreateSocialLead({ orgId, channel: 'linkedin', externalUserId: actor, name, username: null, kind: 'comment' });
    await setConversationLead(conversation.id, lead.id, name);
    leadId = lead.id;
  }

  await logPipelineEvent(
    {
      key: null,
      email: null,
      channel: 'linkedin',
      event: 'comment_received',
      stage: null,
      campaignId: null,
      replyText: text,
      occurredAt,
      payload: { conversationId: conversation.id, externalId: urn, kind: 'comment', post: postUrn },
    },
    leadId
  );
  return true;
}

/** Sincronizează comentariile de la ultimele postări ale paginii. Nu aruncă: eroarea ajunge în rezultat și în conexiune. */
export async function syncLinkedInComments(orgId: string): Promise<LinkedInSyncResult> {
  const result: LinkedInSyncResult = { posts: 0, comments: 0, newComments: 0, errors: [] };
  try {
    const { token, organizationUrn } = await getAccessToken(orgId);
    const posts = await recentPostUrns(token, organizationUrn);
    result.posts = posts.length;

    for (const postUrn of posts) {
      try {
        const { data } = await linkedin<{ elements?: LinkedInComment[] }>(`socialActions/${encodeUrn(postUrn)}/comments`, {
          token,
          query: `count=${COMMENTS_PER_POST}`,
        });
        for (const comment of data.elements ?? []) {
          result.comments++;
          try {
            if (await ingestComment(orgId, organizationUrn, postUrn, comment)) result.newComments++;
          } catch (error) {
            result.errors.push(`comentariu ${comment.id ?? '?'}: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        result.errors.push(`${postUrn}: ${(error as Error).message}`);
      }
    }
    await recordSyncResult(orgId, result.errors.length > 0 ? result.errors[0].slice(0, 500) : null);
  } catch (error) {
    const message = (error as Error).message;
    result.errors.push(message);
    await recordSyncResult(orgId, message.slice(0, 500)).catch(() => undefined);
  }
  return result;
}

/**
 * Răspuns public ca pagină la un comentariu (în firul lui). Întoarce id-ul
 * comentariului nou (antetul `x-restli-id`).
 */
export async function replyLinkedInComment(orgId: string, commentUrn: string, postUrn: string, text: string): Promise<string | null> {
  const { token, organizationUrn } = await getAccessToken(orgId);
  const { restliId } = await linkedin<unknown>(`socialActions/${encodeUrn(commentUrn)}/comments`, {
    token,
    method: 'POST',
    body: {
      actor: organizationUrn,
      object: postUrn,
      parentComment: commentUrn,
      message: { text: text.slice(0, 1250) },
    },
  });
  return restliId;
}
