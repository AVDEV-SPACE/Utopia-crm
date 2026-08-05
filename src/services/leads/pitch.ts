import { Lead } from './types';
import { UTOPIA_SERVICES } from './utopia-services';

const SYSTEM_PROMPT = `Ești un copywriter B2B extrem de direct pentru Utopia Systems. 
Vei primi: Nume firmă, Nișă, Problema Urgentă a site-ului (chiar dacă scorul e bun, folosește acea problemă minoră găsită), Lista Servicii.

REGULĂ SUPREMĂ: Răspunzi DOAR cu JSON valid: {"subject": "...", "body": "..."}.

STRUCTURA OBLIGATORIE PENTRU "body" (Nu devia de la acest șablon):
Trebuie să scrii exact două paragrafe, construite astfel:

[Paragraful 1: Hook + Pain Point]
Începe direct cu: "Salut echipa [Nume Firmă], am analizat site-ul vostru și am observat [inserează Problema Urgentă din input]." Apoi adaugă o propoziție despre impact: "În domeniul vostru, această problemă tehnică înseamnă [explică pierderea: ex. trafic irosit, pacienți care închid pagina și se programează la concurență, lipsă de încredere]."

[Paragraful 2: Soluția + CTA]
Propune soluția direct: "Cu [inserează un serviciu relevant Utopia] putem elimina acest blocaj. Aveți posibilitatea de a programa o discuție scurtă de 15 minute prin care să elaborăm strategia de remediere?"

STRUCTURA OBLIGATORIE PENTRU "subject":
- CUVINTE INTERZISE STRICT: "Optimizare", "Colaborare", "Ofertă", "Prezentare".
- REGULĂ: Subiectul trebuie să fie o întrebare sau o constatare bazată DOAR pe problemă. 
- EXEMPLE BUNE: "Pierdeți pacienți din cauza [Problemei]?", "Am găsit o problemă tehnică pe site-ul [Nume Firmă]".
- Dacă "channel" nu e email, pune "subject": null.`;


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

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export interface GeneratedPitch {
  subject: string | null;
  body: string;
}

export async function generatePitch(lead: Lead): Promise<GeneratedPitch> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY nu este setat în .env');
  }

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

Servicii Utopia Systems disponibile:
${servicesList}

Răspunde doar cu JSON: {"subject": ..., "body": ...}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  const data = (await res.json()) as GroqChatResponse;

  if (!res.ok) {
    throw new Error(`Groq API ${res.status}: ${data.error?.message ?? 'eroare necunoscută'}`);
  }

  const raw = data.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error('Groq nu a returnat un răspuns text');
  }

  let parsed: { subject?: string | null; body?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Groq nu a returnat JSON valid pentru pitch');
  }

  if (!parsed.body) {
    throw new Error('Răspunsul Groq nu conține "body"');
  }

  return {
    subject: lead.pitch_channel === 'email' ? (parsed.subject?.trim() ?? null) : null,
    body: parsed.body.trim(),
  };
}
