import { z } from 'zod';
import { groqJson } from '@/services/engine/groq';
import { cleanText, LEAKED_JARGON, LINK_PATTERN, wordCount } from '@/services/engine/score';
import type { OutreachChannel, ReplyIntent } from './types';

/**
 * Groq pentru outreach: follow-up-urile secvenței (pașii 2 și 3, într-un
 * singur apel ca să economisim tokeni) și clasificarea răspunsurilor.
 */

const FOLLOWUP_SYSTEM = `Scrii follow-up-uri pentru Utopia Systems, o agenție din România (site-uri rapide, agenți AI, automatizări, CRM pentru firme locale).
Primești primul mesaj trimis unei firme, care nu a răspuns încă.

Scrie două mesaje:
- followup_2: follow-up scurt, maximum 50 de cuvinte. Face referire la mesajul anterior („Revin la mesajul meu de săptămâna trecută...”) și reia, pe scurt, o singură idee concretă din el.
- followup_3: ultimul mesaj din secvență, politicos, maximum 50 de cuvinte. Spune că nu mai revii și lasă ușa deschisă („Dacă pe viitor...”).

Reguli stricte:
- Folosește DOAR ce apare în primul mesaj. Nu inventa cifre, clienți, rezultate sau probleme noi.
- Adresare cu „dumneavoastră”, limba română corectă, cu diacritice. Începe cu „Bună ziua”.
- Fără link-uri, fără URL-uri, fără semnătură (se adaugă automat).
- CTA de interes, nu cerere de call sau întâlnire.

Răspunde doar cu JSON: {"followup_2", "followup_3"}.`;

const FOLLOWUP_SCHEMA = {
  type: 'object',
  properties: {
    followup_2: { type: 'string' },
    followup_3: { type: 'string' },
  },
  required: ['followup_2', 'followup_3'],
  additionalProperties: false,
};

const MAX_FOLLOWUP_WORDS = 60;

const followupOutput = z.object({
  followup_2: z.string().transform(cleanText).pipe(z.string().min(1).max(800)),
  followup_3: z.string().transform(cleanText).pipe(z.string().min(1).max(800)),
});

export interface FollowupFacts {
  firma: string;
  nisa: string | null;
  oras: string | null;
  canal: OutreachChannel;
  subiect_initial: string | null;
  mesaj_initial: string;
}

/** Pașii 2 și 3 ai secvenței. Aruncă eroare dacă textele încalcă regulile. */
export async function generateFollowups(
  facts: FollowupFacts,
  deadline: number
): Promise<{ step2: string; step3: string }> {
  const raw = await groqJson({
    system: FOLLOWUP_SYSTEM,
    user: `Date (JSON):\n${JSON.stringify(facts)}`,
    schemaName: 'outreach_followups',
    schema: FOLLOWUP_SCHEMA,
    maxTokens: 800,
    deadline,
  });

  const parsed = followupOutput.safeParse(raw);
  if (!parsed.success) throw new Error('Follow-up AI invalid');

  const { followup_2: step2, followup_3: step3 } = parsed.data;
  for (const text of [step2, step3]) {
    if (wordCount(text) > MAX_FOLLOWUP_WORDS) throw new Error(`Follow-up prea lung (${wordCount(text)} cuvinte)`);
    if (LINK_PATTERN.test(text)) throw new Error('Follow-up-ul conține link-uri');
    if (LEAKED_JARGON.test(text)) throw new Error('Follow-up-ul conține formulări interne');
  }
  return { step2, step3 };
}

// ── Clasificarea răspunsurilor ──────────────────────────────────────────────

export const REPLY_INTENTS: readonly ReplyIntent[] = [
  'interested',
  'question',
  'objection',
  'not_interested',
  'unsubscribe',
  'out_of_office',
];

const CLASSIFY_SYSTEM = `Clasifici răspunsurile primite la un email de prospectare trimis de o agenție digitală din România.
Intenții posibile:
- interested: vrea detalii, o ofertă, o discuție sau spune „da”;
- question: pune o întrebare (preț, cum funcționează) fără să-și arate clar interesul;
- objection: are o obiecție (are deja furnizor, e scump, nu acum) dar nu refuză definitiv;
- not_interested: refuză clar;
- unsubscribe: cere explicit să nu mai fie contactat sau să fie scos din listă;
- out_of_office: răspuns automat (concediu, absență, „vă vom răspunde în curând”).
summary: o frază scurtă în română cu ce spune mesajul.
Răspunde doar cu JSON: {"intent", "summary"}.`;

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: REPLY_INTENTS },
    summary: { type: 'string' },
  },
  required: ['intent', 'summary'],
  additionalProperties: false,
};

const classifyOutput = z.object({
  intent: z.enum(REPLY_INTENTS as [ReplyIntent, ...ReplyIntent[]]),
  summary: z.string().transform(cleanText).pipe(z.string().max(500)),
});

/** Textul trimis la clasificare e limitat: tokenii free tier sunt numărați. */
const MAX_REPLY_CHARS = 2_000;

export async function classifyReply(
  reply: { subject: string | null; text: string },
  deadline: number
): Promise<{ intent: ReplyIntent; summary: string }> {
  const raw = await groqJson({
    system: CLASSIFY_SYSTEM,
    user: `Subiect: ${reply.subject ?? '(fără)'}\n\nMesaj:\n${reply.text.slice(0, MAX_REPLY_CHARS)}`,
    schemaName: 'reply_intent',
    schema: CLASSIFY_SCHEMA,
    maxTokens: 300,
    deadline,
  });
  const parsed = classifyOutput.safeParse(raw);
  if (!parsed.success) throw new Error('Clasificare AI invalidă');
  return parsed.data;
}

/** Etapa în care duce o intenție; `null` = rămâne REPLIED (sau neschimbată, la out_of_office). */
export function stageForIntent(intent: ReplyIntent | null): string | null {
  switch (intent) {
    case 'interested':
      return 'INTERESTED';
    case 'not_interested':
      return 'LOST';
    case 'unsubscribe':
      return 'DO_NOT_CONTACT';
    default:
      return null;
  }
}
