import { channelForAccount, fbPageId, igBusinessId, socialOrgId, type SocialChannel } from './config';

/**
 * Normalizarea payload-urilor de webhook Meta într-o listă de evenimente
 * interne. Formatul Graph nu iese din acest fișier: restul modulului vede doar
 * `SocialEvent`.
 *
 * - object="page":      messaging[] (DM, postback) + changes[] field="feed" item="comment"
 * - object="instagram": messaging[] (DM) + changes[] field="comments"
 * Ecourile (`is_echo`, mesajele trimise de noi) și comentariile paginii/contului
 * propriu se ignoră.
 */

export type SocialEventKind = 'dm' | 'comment';

export interface SocialEvent {
  orgId: string;
  channel: SocialChannel;
  kind: SocialEventKind;
  /** PSID (Facebook) / IGSID (Instagram) — cine a scris */
  externalUserId: string;
  senderName: string | null;
  /** `mid` pentru DM, id-ul comentariului pentru comentarii */
  externalId: string;
  /** Postarea (FB) / media (IG) la care e comentariul; comentariul-părinte la un răspuns */
  externalParentId: string | null;
  text: string;
  occurredAt: Date;
}

interface MetaMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: unknown[] };
  postback?: { mid?: string; title?: string; payload?: string };
}

interface MetaChange {
  field?: string;
  value?: Record<string, unknown>;
}

interface MetaEntry {
  id?: string;
  time?: number;
  messaging?: MetaMessaging[];
  changes?: MetaChange[];
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: MetaEntry[];
}

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

function fromMessaging(m: MetaMessaging, channel: SocialChannel, orgId: string): SocialEvent | null {
  const sender = m.sender?.id;
  if (!sender || m.message?.is_echo) return null;
  // Mesaje trimise chiar de pagină / cont (ex. din Business Suite) — nu sunt de la client
  if (sender === fbPageId() || sender === igBusinessId()) return null;

  const occurredAt = new Date(m.timestamp ?? Date.now());
  if (m.message?.mid) {
    const attachments = m.message.attachments?.length ?? 0;
    return {
      orgId,
      channel,
      kind: 'dm',
      externalUserId: sender,
      senderName: null,
      externalId: m.message.mid,
      externalParentId: null,
      text: m.message.text?.trim() || (attachments > 0 ? '[atașament]' : '[mesaj fără text]'),
      occurredAt,
    };
  }
  if (m.postback) {
    // Butoanele din Messenger: textul butonului contează ca mesaj al clientului
    return {
      orgId,
      channel,
      kind: 'dm',
      externalUserId: sender,
      senderName: null,
      externalId: m.postback.mid ?? `postback:${sender}:${m.timestamp ?? Date.now()}`,
      externalParentId: null,
      text: m.postback.title?.trim() || m.postback.payload?.trim() || '[buton]',
      occurredAt,
    };
  }
  return null;
}

function fromChange(change: MetaChange, channel: SocialChannel, orgId: string, entryTime: number | undefined): SocialEvent | null {
  const v = change.value ?? {};

  if (channel === 'facebook' && change.field === 'feed' && v.item === 'comment' && v.verb === 'add') {
    const from = (v.from ?? {}) as { id?: string; name?: string };
    const commentId = str(v.comment_id);
    if (!from.id || !commentId || from.id === fbPageId()) return null;
    const created = typeof v.created_time === 'number' ? v.created_time * 1000 : (entryTime ?? Date.now() / 1000) * 1000;
    return {
      orgId,
      channel,
      kind: 'comment',
      externalUserId: from.id,
      senderName: from.name ?? null,
      externalId: commentId,
      // Răspuns la alt comentariu → părintele; altfel postarea
      externalParentId: str(v.parent_id) ?? str(v.post_id),
      text: str(v.message) ?? '[comentariu fără text]',
      occurredAt: new Date(created),
    };
  }

  if (channel === 'instagram' && change.field === 'comments') {
    const from = (v.from ?? {}) as { id?: string; username?: string };
    const commentId = str(v.id);
    if (!from.id || !commentId || from.id === igBusinessId()) return null;
    const media = (v.media ?? {}) as { id?: string };
    return {
      orgId,
      channel,
      kind: 'comment',
      externalUserId: from.id,
      senderName: from.username ?? null,
      externalId: commentId,
      externalParentId: str(v.parent_id) ?? media.id ?? null,
      text: str(v.text) ?? '[comentariu fără text]',
      occurredAt: new Date((entryTime ?? Date.now() / 1000) * 1000),
    };
  }

  return null;
}

/** Evenimentele relevante din payload; paginile/conturile străine se ignoră. */
export function parseMetaWebhook(payload: MetaWebhookPayload): SocialEvent[] {
  const orgId = socialOrgId();
  if (!orgId) return [];
  if (payload.object !== 'page' && payload.object !== 'instagram') return [];

  const events: SocialEvent[] = [];
  for (const entry of payload.entry ?? []) {
    const channel = channelForAccount(entry.id ?? '');
    if (!channel) continue;
    // Un DM IG poate veni și sub object="page" (Messenger API pentru Instagram); canalul
    // îl dă contul din `entry.id`, nu obiectul
    for (const m of entry.messaging ?? []) {
      const event = fromMessaging(m, channel, orgId);
      if (event) events.push(event);
    }
    for (const change of entry.changes ?? []) {
      const event = fromChange(change, channel, orgId, entry.time);
      if (event) events.push(event);
    }
  }
  return events;
}
