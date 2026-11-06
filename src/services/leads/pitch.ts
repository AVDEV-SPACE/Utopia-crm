import { groqJson } from '@/services/engine/groq';
import { bannedPhrase, COMPANY, factualViolation, nichePain, positioningFacts, withGreeting, WRITING_RULES } from '@/services/engine/positioning';
import { Lead } from './types';
import { UTOPIA_SERVICES } from './utopia-services';

const SYSTEM_PROMPT = `Ești copywriter B2B pentru ${COMPANY}
Vei primi: nume firmă, nișă, problema cea mai urgentă a site-ului, durerea tipică a nișei, afirmațiile de expertiză aprobate și lista de servicii.

REGULĂ SUPREMĂ: Răspunzi DOAR cu JSON valid: {"subject": "...", "body": "..."}.

STRUCTURA OBLIGATORIE PENTRU "body" — exact două paragrafe:

[Paragraful 1: durerea]
Începe cu „Bună ziua,” și apoi direct cu consecința pentru clienții lor: durerea nișei, legată de problema din input (ex. „În clinicile stomatologice, cele mai multe cereri vin seara — iar un site care nu se încarcă pe mobil le trimite direct la clinica următoare.”). Nu începe cu „Am analizat site-ul” sau „Am observat”.

[Paragraful 2: expertiza]
Sistemul profesional potrivit (un serviciu relevant din listă, descris prin ce face, fără preț), apoi afirmația de expertiză aprobată (fără să-i schimbi sensul sau cifrele). Mesajul se termină cu ea.

${WRITING_RULES}

STRUCTURA OBLIGATORIE PENTRU "subject":
- CUVINTE INTERZISE STRICT: „Optimizare”, „Colaborare”, „Ofertă”, „Prezentare”.
- O constatare scurtă despre consecința pentru clienții lor (ex. „Pacienții care caută programare seara”), maximum 8 cuvinte.
- Dacă "channel" nu e email, pune "subject": null.

Adresare cu „dumneavoastră”, limba română corectă, cu diacritice, maximum 110 cuvinte, fără link-uri.`;


interface IssueSummary {
  primary: string;
  all: string[];
}

/**
 * Ordine de severitate: site inaccesibil (cel mai urgent) > nesigur (fără HTTPS)
 * > neadaptat mobil > încărcare lentă. Primul element devine hook-ul de subiect.
 */
function summarizeIssues(lead: Lead): IssueSummary {
  const d = lead.score_details;
  if (!d) return { primary: 'Nu există detalii de scor disponibile.', all: [] };

  const issues: string[] = [];
  if (!d.reachable) issues.push('site-ul nu a putut fi accesat în momentul scanării (posibil offline)');
  if (!d.https) issues.push('site-ul nu are HTTPS (browserele îl marchează ca nesigur)');
  if (!d.mobile_friendly) issues.push('site-ul nu este optimizat pentru mobil');
  if (d.page_speed_mobile !== null && d.page_speed_mobile < 50) {
    issues.push(`viteză de încărcare pe mobil foarte slabă (scor PageSpeed: ${d.page_speed_mobile}/100)`);
  }

  if (issues.length === 0) {
    return { primary: 'Site funcțional, fără probleme majore identificate.', all: [] };
  }

  return { primary: issues[0], all: issues };
}

export interface GeneratedPitch {
  subject: string | null;
  body: string;
}

export async function generatePitch(lead: Lead): Promise<GeneratedPitch> {
  const servicesList = UTOPIA_SERVICES.map(
    (s) => `- ${s.name} (${s.priceEur} EUR): ${s.description}`
  ).join('\n');

  const { primary, all } = summarizeIssues(lead);

  const userMessage = `Firmă: ${lead.company_name}
Nișă: ${lead.niche ?? 'necunoscută'}
Locație: ${lead.location ?? 'necunoscută'}
Canal: ${lead.pitch_channel}
Cea mai urgentă problemă: ${primary}
Toate problemele identificate: ${all.length > 0 ? all.join('; ') : 'niciuna'}
Durerea tipică a nișei: ${nichePain(lead.niche)}

Afirmația de expertiză aprobată (redată complet și fidel):
${positioningFacts(lead.niche, lead.company_name).dovezi_aprobate.join('\n')}

Servicii Utopia Systems disponibile:
${servicesList}

Răspunde doar cu JSON: {"subject": ..., "body": ...}`;

  // O a doua încercare doar când textul folosește o formulare interzisă
  let rejection: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = await requestPitch(
      rejection ? `${userMessage}\n\nRăspunsul anterior a fost respins: ${rejection}. Rescrie respectând toate regulile.` : userMessage
    );
    const weak = bannedPhrase(parsed.subject ?? '') ?? bannedPhrase(parsed.body);
    const factual = factualViolation({ email: parsed.body, auditIssues: all.length });
    if (!weak && !factual) {
      return {
        subject: lead.pitch_channel === 'email' ? (parsed.subject?.trim() ?? null) : null,
        body: withGreeting(parsed.body.trim()),
      };
    }
    rejection = weak ? `folosește formularea interzisă „${weak}”` : factual;
  }
  throw new Error(`Pitch-ul generat a fost respins: ${rejection}`);
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
};

async function requestPitch(userMessage: string): Promise<{ subject?: string | null; body: string }> {
  const parsed = (await groqJson({
    system: SYSTEM_PROMPT,
    user: userMessage,
    schemaName: 'lead_pitch_legacy',
    schema: OUTPUT_SCHEMA,
    maxTokens: 1_000,
    deadline: Date.now() + 45_000,
  })) as { subject?: string | null; body?: string };

  if (!parsed.body) {
    throw new Error('Răspunsul Groq nu conține "body"');
  }
  return { subject: parsed.subject, body: parsed.body };
}
