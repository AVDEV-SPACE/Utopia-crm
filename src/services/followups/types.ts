// Tipurile modulului AI Follow-Up & WhatsApp Automation.

export type ConversationChannel = 'whatsapp' | 'sms';

/** 'user' = clientul, 'assistant' = AI, 'human' = operator uman din CRM */
export type ConversationRole = 'user' | 'assistant' | 'human';

export interface OrganizationSettings {
  org_id: string;
  api_key: string;
  missed_call_sms_enabled: boolean;
  missed_call_sms_message: string;
  whatsapp_ai_enabled: boolean;
  whatsapp_system_prompt: string;
  human_takeover_minutes: number;
  created_at: string;
  updated_at: string;
}

/** Ce poate modifica UI-ul din /dashboard/follow-ups-ai (fără org_id / api_key). */
export interface OrganizationSettingsPatch {
  missed_call_sms_enabled?: boolean;
  missed_call_sms_message?: string;
  whatsapp_ai_enabled?: boolean;
  whatsapp_system_prompt?: string;
  human_takeover_minutes?: number;
}

export interface Conversation {
  id: string;
  org_id: string;
  channel: ConversationChannel;
  contact_phone: string;
  wa_id: string | null;
  contact_name: string | null;
  taken_by_human: boolean;
  taken_by_human_at: string | null;
  taken_by_user_id: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: ConversationRole;
  body: string;
  twilio_sid: string | null;
  created_at: string;
}

/** Payload-ul Twilio, normalizat din form-urlencoded sau JSON. */
export interface TwilioWebhookPayload {
  // Voice
  CallSid?: string;
  CallStatus?: string;
  Direction?: string;
  // Messaging
  MessageSid?: string;
  SmsSid?: string;
  WaId?: string;
  Body?: string;
  ProfileName?: string;
  NumMedia?: string;
  // Comune
  From?: string;
  To?: string;
  AccountSid?: string;
}

/** Statusurile de apel care înseamnă „apel pierdut". */
export const MISSED_CALL_STATUSES = ['no-answer', 'busy', 'failed', 'canceled'] as const;

export const DEFAULT_MISSED_CALL_MESSAGE =
  'Salut! Am văzut că ai sunat, dar nu am putut răspunde. Cu ce te putem ajuta?';

export const DEFAULT_WHATSAPP_SYSTEM_PROMPT = `Ești asistentul virtual al agenției Utopia Systems.
Răspunzi în limba română, prietenos, scurt (maximum 3 propoziții) și la obiect.
Rolul tău: califici clientul (ce serviciu îl interesează, buget aproximativ, termen)
și îl inviți la o discuție de 15 minute cu un consultant.
Nu inventa prețuri, termene sau garanții. Dacă nu știi ceva, spui că revine un coleg cu detalii.`;

export const DEFAULT_HUMAN_TAKEOVER_MINUTES = 3;
