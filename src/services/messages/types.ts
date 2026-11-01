/** Instagram / Facebook / LinkedIn: trimiteri manuale din fișa lead-ului (și `leads.pitch_channel`). */
export type MessageChannel = 'email' | 'sms' | 'whatsapp' | 'instagram' | 'facebook' | 'linkedin';
export type MessageRecipientType = 'lead' | 'client';
export type MessageStatus = 'sent' | 'failed';

/** O linie din jurnalul `sent_messages`. */
export interface SentMessage {
  id: string;
  org_id: string | null;
  sent_by: string | null;
  channel: MessageChannel;
  recipient_type: MessageRecipientType;
  lead_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  template_id: string | null;
  template_title: string | null;
  subject: string | null;
  body: string;
  status: MessageStatus;
  error: string | null;
  created_at: string;
  /**
   * 'journal' = trimitere înregistrată de CRM;
   * 'lead'    = derivată dintr-un lead marcat ca trimis, fără linie de jurnal.
   */
  source: 'journal' | 'lead';
  /** Message-ID-ul SMTP al emailului; null pentru SMS/WhatsApp și trimiterile vechi. */
  message_id: string | null;
  /** Momentul primului răspuns primit (emailuri: sincronizat din Gmail prin IMAP). */
  replied_at: string | null;
  reply_message_id: string | null;
  reply_subject: string | null;
  reply_snippet: string | null;
  /** Link spre emailul trimis în Gmail (calculat pe server); null pentru alte canale. */
  gmail_url: string | null;
  /** Link spre răspuns în Gmail, când există. */
  reply_gmail_url: string | null;
}

/** Ce se scrie în jurnal după o trimitere (org_id / sent_by vin din context). */
export interface NewSentMessage {
  channel: MessageChannel;
  recipient_type: MessageRecipientType;
  lead_id?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  template_id?: string | null;
  template_title?: string | null;
  subject?: string | null;
  body: string;
  status?: MessageStatus;
  error?: string | null;
  /** Message-ID-ul întors de SMTP, pentru emailurile reușite. */
  message_id?: string | null;
}

export interface SentMessageFilters {
  channel?: MessageChannel | null;
  recipientType?: MessageRecipientType | null;
  leadId?: string | null;
  /** Caută în numele, emailul, telefonul și subiectul destinatarului. */
  search?: string | null;
  limit?: number;
}
