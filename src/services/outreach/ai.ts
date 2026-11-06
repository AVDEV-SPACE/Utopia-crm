import { z } from 'zod';
import { groqJson } from '@/services/engine/groq';
import { bannedPhrase, COMPANY, positioningFacts, WRITING_RULES } from '@/services/engine/positioning';
import { cleanText, LEAKED_JARGON, LINK_PATTERN, wordCount } from '@/services/engine/score';
import type { OutreachChannel, ReplyIntent } from './types';

/**
 * Groq pentru outreach: follow-up-urile secvenței (pașii 2 și 3, într-un
 * singur apel ca să economisim tokeni) și clasificarea răspunsurilor.
 */

const FOLLOWUP_SYSTEM = `Scrii follow-up-uri pentru ${COMPANY}
Primești primul mesaj trimis unei firme, care nu a răspuns încă.

Scrie două mesaje:
- followup_2: maximum 70 de cuvinte, trimis la 3 zile după primul. Nu repeta primul mesaj și nu începe cu „Revin la mesajul meu”: adaugă un unghi nou al aceleiași dureri (durere_nisa) — ce înseamnă pentru clienții lor — apoi o afirmație de expertiză din dovezi_aprobate, alta decât cea din primul mesaj.
- followup_3: ultimul mesaj, maximum 45 de cuvinte. Scurt și sigur pe el: închide subiectul („Nu vă mai scriu pe acest subiect”) și încheie cu o afirmație de expertiză din dovezi_aprobate.

Reguli despre fapte:
- Folosește DOAR ce apare în primul mesaj, durere_nisa și dovezi_aprobate. Nu inventa cifre, clienți, rezultate sau probleme noi.

${WRITING_RULES}

Format:
- Adresare cu „dumneavoastră”, limba română corectă, cu diacritice. Începe cu „Bună ziua”.
- Fără link-uri, fără URL-uri, fără semnătură.

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

const MAX_FOLLOWUP_WORDS = 100;

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
    user: `Date (JSON):\n${JSON.stringify({ ...facts, ...positioningFacts(facts.nisa) })}`,
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
    const weak = bannedPhrase(text);
    if (weak) throw new Error(`Follow-up-ul folosește o formulare interzisă („${weak}”)`);
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
  'neutral',
];

const CLASSIFY_SYSTEM = `Clasifici răspunsurile primite la un email de prospectare trimis de o agenție digitală din România.
Intenții posibile:
- interested: vrea detalii, o ofertă, o discuție sau spune „da”;
- question: pune o întrebare (preț, cum funcționează) fără să-și arate clar interesul;
- objection: are o obiecție (are deja furnizor, e scump, nu acum) dar nu refuză definitiv;
- not_interested: refuză explicit („nu ne interesează”, „nu, mulțumesc”, „nu avem nevoie”);
- unsubscribe: cere explicit să nu mai fie contactat sau să fie scos din listă;
- out_of_office: răspuns automat (concediu, absență, „vă vom răspunde în curând”);
- neutral: fără o intenție clară — un cuvânt, „ok”, „test”, „mulțumesc”, o confirmare de primire.
Un mesaj care nu refuză explicit NU e not_interested: în caz de dubiu, alege neutral.
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

/**
 * Etapa în care duce o intenție; `null` = rămâne REPLIED (sau neschimbată, la out_of_office).
 * Doar un refuz explicit duce în LOST, care e finală.
 */
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

// ── Ajustarea unui mesaj din fișa lead-ului ────────────────────────────────

const REWRITE_SYSTEM = `Ajustezi un mesaj de prospectare al ${COMPANY}
Ajustarea se face după instrucțiunea utilizatorului. Primești: canalul, mesajul actual (și subiectul, la email), instrucțiunea și faptele verificate despre firmă (inclusiv durere_nisa și dovezi_aprobate).

${WRITING_RULES}
Instrucțiunea utilizatorului are prioritate la ton și lungime, dar nu la regulile despre fapte și formulările interzise.

Reguli stricte:
- Aplică instrucțiunea, dar folosește DOAR faptele primite, dovezi_aprobate și ce apare în mesajul actual. Nu inventa cifre, clienți, rezultate, prețuri sau probleme.
- Limba română corectă, cu diacritice. Păstrează forma de adresare din mesajul actual, dacă instrucțiunea nu cere altfel.
- Nu adăuga link-uri sau URL-uri care nu existau deja. Fără semnătură.
- Pe Instagram, Facebook, LinkedIn, WhatsApp și SMS: mesaj scurt, conversațional, fără subiect.
- subject: doar pentru email (altfel șir gol), maximum 80 de caractere.
Răspunde doar cu JSON: {"subject", "body"}.`;

const REWRITE_SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
};

const rewriteOutput = z.object({
  subject: z.string().transform(cleanText).pipe(z.string().max(200)),
  body: z.string().transform(cleanText).pipe(z.string().min(1).max(6000)),
});

/** Cuvinte maxime pe canal după ajustare. */
const REWRITE_MAX_WORDS: Record<string, number> = { email: 250, sms: 70, whatsapp: 120, instagram: 90, facebook: 120, linkedin: 120 };

export interface RewriteInput {
  channel: string;
  subject: string | null;
  body: string;
  instruction: string;
  facts: Record<string, unknown>;
}

export async function rewriteMessage(input: RewriteInput, deadline: number): Promise<{ subject: string | null; body: string }> {
  const raw = await groqJson({
    system: REWRITE_SYSTEM,
    user: `Date (JSON):\n${JSON.stringify({
      canal: input.channel,
      subiect_actual: input.subject,
      mesaj_actual: input.body.slice(0, 6000),
      instructiune: input.instruction.slice(0, 500),
      fapte: input.facts,
      ...positioningFacts(typeof input.facts.nisa === 'string' ? input.facts.nisa : null),
    })}`,
    schemaName: 'message_rewrite',
    schema: REWRITE_SCHEMA,
    maxTokens: 1500,
    deadline,
  });

  const parsed = rewriteOutput.safeParse(raw);
  if (!parsed.success) throw new Error('Răspuns AI invalid');
  const { subject, body } = parsed.data;

  const max = REWRITE_MAX_WORDS[input.channel] ?? 250;
  if (wordCount(body) > max) throw new Error(`Mesajul ajustat e prea lung (${wordCount(body)} cuvinte, maxim ${max}) — cere o variantă mai scurtă`);
  if (!LINK_PATTERN.test(input.body) && LINK_PATTERN.test(body)) throw new Error('AI-ul a adăugat link-uri — încearcă din nou');
  if (LEAKED_JARGON.test(body) || LEAKED_JARGON.test(subject)) throw new Error('Mesajul ajustat conține formulări interne — încearcă din nou');
  const weak = bannedPhrase(`${subject}\n${body}`);
  if (weak) throw new Error(`Mesajul ajustat folosește o formulare interzisă („${weak}”) — încearcă din nou`);

  return { subject: input.channel === 'email' ? subject || input.subject : null, body };
}
