import type { LeadStatus } from '@/services/leads/types';

/**
 * Etapele pipeline-ului de leaduri. Ordinea din STAGE_RANK e ordinea „înainte":
 * o etapă nu coboară niciodată, iar WON / LOST / DO_NOT_CONTACT sunt finale.
 *
 * Modul e pur (fără DB), deci îl pot importa și componentele client.
 */
export const STAGE_RANK: Record<string, number> = {
  SOURCED: 0, AI_ERROR: 1, DISQUALIFIED_NO_CONTACT: 1, DISQUALIFIED: 1, QUEUED_MANUAL: 2, QUEUED_EMAIL: 2,
  CONTACTED: 3, OPENED: 4, REPLIED: 5, INTERESTED: 6, CALL_BOOKED: 7, CALL_DONE: 8, PROPOSAL: 9, WON: 10,
};
export const TERMINAL_STAGES = new Set(['WON', 'LOST', 'DO_NOT_CONTACT']);
export function resolveStage(current?: string | null, incoming?: string | null): string {
  if (!incoming) return current ?? 'SOURCED';
  if (!current) return incoming;
  if (TERMINAL_STAGES.has(current)) return current;
  if (TERMINAL_STAGES.has(incoming)) return incoming;
  return (STAGE_RANK[incoming] ?? 0) >= (STAGE_RANK[current] ?? 0) ? incoming : current;
}
export function blocksOutreach(stage?: string | null): boolean {
  if (!stage) return false;
  return TERMINAL_STAGES.has(stage) || (STAGE_RANK[stage] ?? 0) >= STAGE_RANK.CONTACTED;
}

/** Toate etapele cunoscute, în ordinea pâlniei (pentru filtre și dropdown). */
export const PIPELINE_STAGES = [
  'SOURCED',
  'AI_ERROR',
  'DISQUALIFIED',
  'DISQUALIFIED_NO_CONTACT',
  'QUEUED_EMAIL',
  'QUEUED_MANUAL',
  'CONTACTED',
  'OPENED',
  'REPLIED',
  'INTERESTED',
  'CALL_BOOKED',
  'CALL_DONE',
  'PROPOSAL',
  'WON',
  'LOST',
  'DO_NOT_CONTACT',
] as const;

export const STAGE_LABELS: Record<string, string> = {
  SOURCED: 'Găsit',
  AI_ERROR: 'Eroare AI',
  DISQUALIFIED: 'Descalificat',
  DISQUALIFIED_NO_CONTACT: 'Fără contact',
  QUEUED_EMAIL: 'În coadă email',
  QUEUED_MANUAL: 'În coadă manual',
  CONTACTED: 'Contactat',
  OPENED: 'Deschis',
  REPLIED: 'A răspuns',
  INTERESTED: 'Interesat',
  CALL_BOOKED: 'Call programat',
  CALL_DONE: 'Call făcut',
  PROPOSAL: 'Ofertă',
  WON: 'Câștigat',
  LOST: 'Pierdut',
  DO_NOT_CONTACT: 'Nu contacta',
};

/**
 * Etapa detaliată → `leads.status` (enum lead_status). Coloana `status` rămâne
 * vocabularul general al CRM-ului, folosit de /leads și de rapoarte.
 */
const STAGE_TO_STATUS: Record<string, LeadStatus> = {
  AI_ERROR: 'scored',
  DISQUALIFIED: 'scored',
  DISQUALIFIED_NO_CONTACT: 'scored',
  QUEUED_EMAIL: 'pitch_ready',
  QUEUED_MANUAL: 'pitch_ready',
  CONTACTED: 'sent',
  OPENED: 'sent',
  REPLIED: 'replied',
  INTERESTED: 'replied',
  CALL_BOOKED: 'negotiating',
  CALL_DONE: 'negotiating',
  PROPOSAL: 'negotiating',
  WON: 'won',
  LOST: 'lost',
  DO_NOT_CONTACT: 'lost',
};

/** Etapă necunoscută (sau SOURCED) → 'new'. */
export function statusForStage(stage?: string | null): LeadStatus {
  return (stage && STAGE_TO_STATUS[stage]) || 'new';
}

/** Normalizează o etapă venită din exterior: litere mari, doar [A-Z_]. */
export function normalizeStage(value?: string | null): string | null {
  const stage = value?.trim().toUpperCase();
  return stage && /^[A-Z_]{2,40}$/.test(stage) ? stage : null;
}
