import { sleep } from './http';

/**
 * Client Groq pentru răspunsuri JSON. Modelul vine din GROQ_MODEL (implicit
 * openai/gpt-oss-120b). Modelele cu Structured Outputs stricte primesc schema
 * JSON (decodare constrânsă); restul primesc JSON object mode.
 *
 * La 429 respectăm `retry-after`: o pauză scurtă se așteaptă, una lungă (plafon
 * zilnic) oprește rularea fără să marcheze lead-ul ca eroare.
 */
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';

/** Modele cu `json_schema` strict, conform docs Groq (Structured Outputs). */
const STRICT_SCHEMA_MODELS = [/^openai\/gpt-oss-(20b|120b)$/, /^qwen\/qwen3/, /^meta-models\/muse-spark/];

/** Cât acceptăm să așteptăm un `retry-after` în cadrul aceleiași rulări. */
const MAX_INLINE_WAIT_MS = 20_000;

export class GroqRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Groq rate limit (reîncearcă peste ${Math.ceil(retryAfterMs / 1000)}s)`);
    this.name = 'GroqRateLimitError';
  }
}

export function groqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

interface GroqJsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  /** Epoch ms după care nu mai așteptăm reîncercări */
  deadline: number;
}

export async function groqJson(req: GroqJsonRequest): Promise<unknown> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY nu este setat');

  const model = groqModel();
  const strict = STRICT_SCHEMA_MODELS.some((re) => re.test(model));
  const isGptOss = model.startsWith('openai/gpt-oss');

  const body = {
    model,
    temperature: 0.4,
    max_completion_tokens: req.maxTokens,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    response_format: strict
      ? { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } }
      : { type: 'json_object' },
    // gpt-oss raționează implicit; „low” păstrează tokenii (plafonul free tier e pe tokeni)
    ...(isGptOss ? { reasoning_effort: 'low', include_reasoning: false } : {}),
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(Math.min(60_000, req.deadline - Date.now()), 5_000)),
    });

    if (res.status === 429) {
      const retryAfterMs = Math.ceil(Number(res.headers.get('retry-after') ?? '10') * 1000);
      if (retryAfterMs > MAX_INLINE_WAIT_MS || Date.now() + retryAfterMs > req.deadline - 10_000) {
        throw new GroqRateLimitError(retryAfterMs);
      }
      await sleep(retryAfterMs);
      continue;
    }
    if (res.status >= 500 && attempt < 2) {
      await sleep(2_000);
      continue;
    }

    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!res.ok) throw new Error(`Groq ${res.status}: ${data.error?.message ?? 'eroare necunoscută'}`);

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Groq nu a returnat conținut');
    try {
      return JSON.parse(content);
    } catch {
      throw new Error('Groq nu a returnat JSON valid');
    }
  }
  throw new GroqRateLimitError(MAX_INLINE_WAIT_MS);
}
