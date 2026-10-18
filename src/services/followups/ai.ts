import { ConversationMessage } from './types';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

interface GroqChatResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

async function groqChat(messages: ChatMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY nu este setat în .env');

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      temperature: 0.6,
      messages,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as GroqChatResponse;
  if (!res.ok) {
    throw new Error(`Groq API ${res.status}: ${data.error?.message ?? 'eroare necunoscută'}`);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq nu a returnat un răspuns text');
  return content;
}

const MISSED_CALL_SYSTEM_PROMPT = `Ești asistentul unei agenții digitale din România.
Scrii UN SINGUR SMS de follow-up pentru un apel la care nu s-a putut răspunde.
Reguli stricte:
- Maximum 160 de caractere, în limba română, cu diacritice.
- Ton prietenos și profesionist, la persoana I plural.
- Îți ceri scuze scurt că nu ai răspuns și întrebi cu ce poți ajuta.
- Fără emoji, fără link-uri, fără semnătură, fără ghilimele.
- Răspunzi DOAR cu textul SMS-ului, nimic altceva.`;

/**
 * Textul SMS-ului la apel pierdut, când organizația nu a configurat unul fix.
 */
export async function generateMissedCallSms(context: {
  callerPhone: string;
  businessName?: string | null;
}): Promise<string> {
  const business = context.businessName?.trim() || 'agenția noastră';
  const text = await groqChat(
    [
      { role: 'system', content: MISSED_CALL_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Nume business: ${business}. Numărul apelantului: ${context.callerPhone}. Scrie SMS-ul.`,
      },
    ],
    120
  );

  // Modelul mai adaugă ghilimele în jurul răspunsului; SMS-ul trebuie curat.
  return text.replace(/^["'`]|["'`]$/g, '').slice(0, 320).trim();
}

/**
 * Răspunsul AI pe WhatsApp/SMS, cu System Prompt-ul definit în
 * /dashboard/follow-ups-ai și istoricul conversației.
 */
export async function generateConversationReply(input: {
  systemPrompt: string;
  history: ConversationMessage[];
  incomingBody: string;
}): Promise<string> {
  const messages: ChatMessage[] = [{ role: 'system', content: input.systemPrompt }];

  for (const message of input.history) {
    // Mesajele scrise de un operator uman intră în istoric ca replici ale
    // asistentului — pentru model sunt „ce a răspuns business-ul până acum".
    messages.push({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.body,
    });
  }

  // Dacă mesajul curent a fost deja logat, ultimul element din istoric e chiar
  // el — nu-l dublăm.
  const last = input.history[input.history.length - 1];
  if (!last || last.role !== 'user' || last.body !== input.incomingBody) {
    messages.push({ role: 'user', content: input.incomingBody });
  }

  const reply = await groqChat(messages, 400);
  // Twilio respinge mesajele foarte lungi; 1500 e sub limita de 1600 caractere.
  return reply.slice(0, 1500);
}
