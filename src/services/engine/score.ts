import { z } from 'zod';
import { groqJson } from './groq';
import { bannedPhrase, COMPANY, factualViolation, positioningFacts, systemGaps, withGreeting, withOpening, withoutBareStat, WRITING_RULES } from './positioning';

/**
 * Scor ICP + pitch cu Groq. Modelul primește DOAR fapte verificate (semnale +
 * audit) și are interdicție explicită să inventeze; rezultatul trece apoi prin
 * validări care resping un email prea lung sau cu link-uri.
 */
/** Scorul maxim al unei firme în afara ICP (aplicat în prompt și în cod). */
export const NON_ICP_MAX_SCORE = 40;

const SYSTEM_PROMPT = `Ești SDR pentru ${COMPANY}

Ofertă pe segment (descrie beneficiile concrete, fără să dai un nume ofertei):
- Segment A (firma investește deja în reclame): sistemul transformă traficul plătit în clienți — pagini care convertesc, programări online, răspuns automat la fiecare cerere.
- Segment B: sistem profesional cu un smart website modern — programări online, preluarea automată a cererilor, profil Google optimizat — pornind de la o problemă din probleme_audit.

ICP: firma investește în reclame SAU e activă pe social media. Dacă icp_match=false, icp_score este maximum 40.

Reguli despre fapte:
- Folosește DOAR faptele din datele primite. Nu inventa cifre, recenzii, clienți sau probleme.
- Nu afirma niciodată că firma NU face ceva (reclame, marketing, social media). Absența unui semnal pe site nu e dovadă. Poți numi doar problemele din probleme_audit și semnalele true.
- reclame_meta_active: true e un fapt verificat; false sau null înseamnă „necunoscut” — nu menționa reclamele.
- Dacă site_incarcat=false, nu face NICIO afirmație despre site și nu presupune că firma n-are site. Pornește de la durere_nisa și oraș.

${WRITING_RULES}

Format:
- Adresare politicoasă, cu „dumneavoastră”, în limba română corectă, cu diacritice. Toate mesajele încep cu „Bună ziua”, niciodată „Salut”.
- Nu copia formulări din aceste instrucțiuni (ex. „problemă verificată”, „segment”, „ICP”, „durere_nisa”, „dovezi_aprobate”) în mesaje.
- first_line: deschiderea emailului — durerea clientului lor, legată de un fapt real din date.
- email_body: maximum 100 de cuvinte, fără link-uri și fără URL-uri, începe cu first_line, se încheie cu afirmația de expertiză.
- subject: maximum 8 cuvinte, despre consecința pentru clienții lor (ex. „Programările care se pierd seara”), fără clickbait, fără întrebare.
- linkedin_dm și instagram_dm: maximum 50 de cuvinte, aceeași structură (durere → expertiză), ton direct, fără link-uri.
- score_reason: o frază scurtă care explică scorul din fapte.

Răspunde doar cu JSON: {"icp_score", "score_reason", "first_line", "subject", "email_body", "linkedin_dm", "instagram_dm"}.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    icp_score: { type: 'integer', minimum: 0, maximum: 100 },
    score_reason: { type: 'string' },
    first_line: { type: 'string' },
    subject: { type: 'string' },
    email_body: { type: 'string' },
    linkedin_dm: { type: 'string' },
    instagram_dm: { type: 'string' },
  },
  required: ['icp_score', 'score_reason', 'first_line', 'subject', 'email_body', 'linkedin_dm', 'instagram_dm'],
  additionalProperties: false,
};

/**
 * Modelele pun uneori cratimă neîntreruptibilă (U+2011) sau spații speciale
 * („site‑ul”); în email și la copiere trebuie caractere obișnuite.
 */
export const cleanText = (value: string) =>
  value
    .replace(/[‐‑‒]/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const text = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));

const outputSchema = z.object({
  icp_score: z.coerce.number().min(0).max(100),
  score_reason: text(500),
  first_line: text(400),
  subject: text(150),
  email_body: text(2000),
  linkedin_dm: text(800),
  instagram_dm: text(800),
});

export type LeadPitch = z.infer<typeof outputSchema>;

/** Faptele trimise modelului. */
export interface ScoreFacts {
  firma: string;
  nisa: string | null;
  oras: string | null;
  segment: 'A' | 'B';
  icp_match: boolean;
  site_incarcat: boolean;
  semnale: Record<string, boolean | number | null>;
  probleme_audit: string[];
  social: { instagram: boolean; facebook: boolean; linkedin: boolean };
  /** `null` = Meta Ad Library nu a fost verificat (fără META_ADLIB_TOKEN) */
  reclame_meta_active: boolean | null;
}

const MAX_EMAIL_WORDS = 120;
const MAX_DM_WORDS = 60;
/** Jargon intern din prompt care nu are ce căuta într-un mesaj către client. */
export const LEAKED_JARGON = /problem[ăa] verificat[ăa]|\bsegment(ul)? [AB]\b|\bICP\b|icp_match|pachet de start|durere_nisa|dovezi_aprobate|componente_lipsa|are_deja/i;
export const LINK_PATTERN = /https?:\/\/|www\.|\b[a-z0-9-]+\.(ro|com|eu|net)\b/i;

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/**
 * Scorează și scrie pitch-ul. Aruncă eroare dacă răspunsul nu respectă
 * regulile — apelantul marchează lead-ul AI_ERROR și îl reia la o rulare ulterioară.
 */
export async function scoreLead(facts: ScoreFacts, deadline: number): Promise<LeadPitch> {
  const user = `Date verificate despre firmă (JSON):\n${JSON.stringify({
    ...facts,
    ...positioningFacts(facts.nisa, facts.firma),
    ...systemGaps(facts.semnale, facts.site_incarcat),
  })}`;
  let rejection: string | null = null;

  // O a doua încercare doar când răspunsul încalcă regulile: modelul primește motivul respingerii
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await groqJson({
      system: SYSTEM_PROMPT,
      user: rejection
        ? `${user}\n\nRăspunsul anterior a fost respins: ${rejection}. Rescrie mesajele respectând toate regulile.`
        : user,
      schemaName: 'lead_pitch',
      schema: OUTPUT_SCHEMA,
      maxTokens: 1_500,
      deadline,
    });

    const parsed = outputSchema.safeParse(raw);
    if (parsed.success) {
      // Fără reîncercare: fraza cu cifra iese din DM direct, nu cu un nou apel AI
      parsed.data.linkedin_dm = withoutBareStat(parsed.data.linkedin_dm);
      parsed.data.instagram_dm = withoutBareStat(parsed.data.instagram_dm);
    }
    rejection = parsed.success
      ? pitchViolation(parsed.data, facts)
      : `Răspuns AI invalid: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`;
    if (parsed.success && !rejection) {
      // Regula ICP se aplică și în cod, nu doar în prompt (enrich nici nu cheamă AI-ul sub prag)
      const score = Math.round(parsed.data.icp_score);
      return {
        ...parsed.data,
        first_line: withGreeting(parsed.data.first_line),
        email_body: withOpening(parsed.data.email_body, parsed.data.first_line),
        linkedin_dm: withGreeting(parsed.data.linkedin_dm),
        instagram_dm: withGreeting(parsed.data.instagram_dm),
        icp_score: facts.icp_match ? score : Math.min(score, NON_ICP_MAX_SCORE),
      };
    }
  }
  throw new Error(rejection ?? 'Răspuns AI invalid');
}

/** Regula încălcată de un pitch, sau `null` dacă e în regulă. */
function pitchViolation(pitch: LeadPitch, facts: ScoreFacts): string | null {
  if (wordCount(pitch.email_body) > MAX_EMAIL_WORDS) return `Email prea lung (${wordCount(pitch.email_body)} cuvinte)`;
  const longDm = [pitch.linkedin_dm, pitch.instagram_dm].find((t) => wordCount(t) > MAX_DM_WORDS);
  if (longDm) return `DM prea lung (${wordCount(longDm)} cuvinte, maximum ${MAX_DM_WORDS})`;
  if ([pitch.email_body, pitch.linkedin_dm, pitch.instagram_dm].some((t) => LINK_PATTERN.test(t))) return 'Mesajul conține link-uri';
  const weak = [pitch.subject, pitch.email_body, pitch.linkedin_dm, pitch.instagram_dm].map(bannedPhrase).find(Boolean);
  if (weak) return `Mesajul folosește o formulare interzisă („${weak}”): deschide cu durerea clienților lor și încheie cu afirmația de expertiză`;
  const leaked = [pitch.subject, pitch.email_body, pitch.linkedin_dm, pitch.instagram_dm]
    .map((t) => t.match(LEAKED_JARGON)?.[0])
    .find(Boolean);
  if (leaked) return `Mesajul conține formulări interne din prompt („${leaked}”)`;
  return factualViolation({ email: pitch.email_body, auditIssues: facts.probleme_audit.length });
}
