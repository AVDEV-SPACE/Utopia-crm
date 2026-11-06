// Tipurile modulului de outreach (Faza 2: email automat; Faza 3: DM-uri manuale).

export type OutreachChannel = 'email' | 'instagram' | 'linkedin';

export type OutreachTaskStatus = 'pending' | 'sent' | 'skipped' | 'replied' | 'failed' | 'cancelled';

export interface OutreachTask {
  id: string;
  lead_id: string;
  channel: OutreachChannel;
  step: number;
  /** Template-ul pasului (randat la trimitere); NULL = textul AI din `message` */
  template_id: number | null;
  /** Subiectul: din AI la planificare, sau cel trimis efectiv (completat la trimitere) */
  subject: string | null;
  message: string | null;
  due_at: string;
  status: OutreachTaskStatus;
  sent_at: string | null;
  error: string | null;
  tracking_token: string;
  message_id: string | null;
  opened_at: string | null;
  reply_handled_at: string | null;
  reply_intent: string | null;
  created_at: string;
  updated_at: string;
}

/** Modelul ales pe fiecare pas al secvenței de email; `null` = AI. */
export interface OutreachSettings {
  step1_template_id: number | null;
  step2_template_id: number | null;
  step3_template_id: number | null;
  /** Câte lead-uri vrei să contactezi pe zi (toate canalele) — ținta din cardul „Pitched” */
  daily_target: number;
  updated_at: string;
}

/** Un template din `educational_templates`, cât îi trebuie outreach-ului. */
export interface OutreachTemplate {
  id: number;
  title: string;
  content: string;
}

/** Intenția unui răspuns, clasificată de Groq. */
export type ReplyIntent =
  | 'interested'
  | 'question'
  | 'objection'
  | 'not_interested'
  | 'unsubscribe'
  | 'out_of_office'
  | 'neutral';

/** Publicul unei campanii de outreach (planificare manuală, din /pipeline sau /leads). */
export interface CampaignFilters {
  /** Nișe / orașe exacte (fără diferență de majuscule); goale = toate */
  niches: string[];
  cities: string[];
  minScore: number | null;
  /** Doar leadurile cu adresă de email (fără fallback pe DM-uri) */
  emailOnly: boolean;
}

export interface PlanResult {
  candidates: number;
  planned: number;
  /** Leaduri sărite la rularea asta (AI indisponibil etc.) — se reiau la următoarea */
  deferred: number;
  /** Id-urile leadurilor amânate (o campanie le sare la lotul următor) */
  deferredIds?: string[];
  errors: string[];
  stoppedReason?: string;
}

export interface SendResult {
  sent: number;
  failed: number;
  /** Pași anulați de gardă (lead ajuns la REPLIED sau final) */
  cancelled: number;
  sentToday: number;
  cap: number;
  skipped?: string;
  errors: string[];
}

export interface InboxSyncResult {
  /** Emailuri trimise (toate, nu doar outreach) verificate în Gmail */
  checked: number;
  /** Răspunsuri noi găsite de sincronizarea din `sent_messages` */
  matched: number;
  /** Răspunsuri la outreach procesate acum (clasificate, secvență oprită/amânată) */
  processed: number;
  outOfOffice: number;
  /** Emailuri respinse găsite acum (adresă moartă, blocare); secvența lor s-a oprit */
  bounced: number;
  errors: string[];
}
