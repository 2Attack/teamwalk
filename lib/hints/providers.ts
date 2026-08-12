import { HINTS_LLM_TIMEOUT_MS } from '@/lib/config';
import type { LlmHint } from '@/lib/validation';
import { llmHintsSchema } from '@/lib/validation';

import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import type { HintSnapshot } from './snapshot';

/**
 * Вызовы LLM без SDK — обычный `fetch` (п. 6.6.1 ТЗ).
 *
 * Модели задаются здесь и только здесь: бесплатные тарифы снимают модели без
 * предупреждения (задокументированный случай — внезапные 404 на захардкоженной
 * модели), поэтому имя выносится в env-переменную, а падение вызова обязано
 * деградировать до резерва и статики, а не ронять страницу.
 */
/**
 * Не одна модель, а список кандидатов по порядку. Проверено на живом ключе:
 * `gemini-2.5-flash` присутствует в каталоге `ListModels`, но на `generateContent`
 * отвечает «no longer available to new users» — то есть проверить доступность
 * заранее нельзя, только попыткой. Первым идёт скользящий алиас: он переживает
 * исчезновение конкретных версий, ради которого этот перебор и заведён.
 */
export const GEMINI_MODELS: readonly string[] = process.env.GEMINI_MODEL
  ? [process.env.GEMINI_MODEL]
  : ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-2.5-flash'];

export const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Одна повторная попытка на провайдера, затем переключение на резерв (п. 8). */
const ATTEMPTS_PER_PROVIDER = 2;

export type ProviderName = 'gemini' | 'groq';

export interface LlmResult {
  provider: ProviderName;
  model: string;
  hints: LlmHint[];
  latencyMs: number;
}

/** Схема структурированного вывода Gemini — подмножество OpenAPI. */
const GEMINI_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      text: { type: 'STRING' },
      tone: { type: 'STRING', enum: ['praise', 'tease', 'neutral', 'tip'] },
      subject: { type: 'STRING', nullable: true },
    },
    required: ['text', 'tone'],
    propertyOrdering: ['text', 'tone', 'subject'],
  },
} as const;

/** `fetch` с жёстким таймаутом: висящий запрос к LLM не должен держать функцию. */
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HINTS_LLM_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ответ, не прошедший Zod, отбрасывается целиком — чинить JSON регулярками
 * запрещено (п. 6.6.3): проще потерять одну генерацию, чем показать мусор.
 */
function parseHints(raw: unknown): LlmHint[] {
  const payload =
    Array.isArray(raw) || raw === null || typeof raw !== 'object'
      ? raw
      : ((raw as Record<string, unknown>).hints ?? raw);
  return llmHintsSchema.parse(payload);
}

/** Модель, ответившая последней успешно, — чтобы не перебирать список каждый раз. */
let lastGoodGeminiModel: string | null = null;

async function callGemini(snapshot: HintSnapshot): Promise<LlmHint[]> {
  const candidates = lastGoodGeminiModel
    ? [lastGoodGeminiModel, ...GEMINI_MODELS.filter((m) => m !== lastGoodGeminiModel)]
    : GEMINI_MODELS;

  let lastError: unknown;
  for (const model of candidates) {
    try {
      const hints = await callGeminiModel(snapshot, model);
      lastGoodGeminiModel = model;
      return hints;
    } catch (error) {
      lastError = error;
      // Модель снята с раздачи или переименована — пробуем следующую.
      const message = error instanceof Error ? error.message : '';
      if (!/HTTP (400|403|404)/.test(message)) throw error;
      console.warn('[hints] модель недоступна, пробуем следующую', { model });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini: все модели недоступны');
}

async function callGeminiModel(snapshot: HintSnapshot, model: string): Promise<LlmHint[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const json = (await fetchJson(`${GEMINI_URL}/${model}:generateContent`, {
    method: 'POST',
    // Ключ уходит заголовком, а не query-параметром: URL попадает в логи целиком.
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(snapshot) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 1.1,
        /*
          Бюджет считается вместе с «размышлениями» модели: на живом ключе из
          2048 токенов 1778 уходило в них, ответ обрывался на середине JSON.
          `thinkingConfig` здесь не задаём — старые модели из списка кандидатов
          его не принимают и отвечают 400. 12 фраз укладываются в ~800 токенов,
          так что запас взят с большим избытком: при 24 генерациях в сутки это
          доли процента бесплатного лимита.
        */
        maxOutputTokens: 8192,
      },
    }),
  })) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };

  const candidate = json.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    // Иначе это выглядело бы как «битый JSON» и уводило диагностику не туда.
    throw new Error(`Gemini (${model}): ответ обрезан по лимиту токенов`);
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini: пустой ответ');
  return parseHints(JSON.parse(text));
}

async function callGroq(snapshot: HintSnapshot): Promise<LlmHint[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const json = (await fetchJson(GROQ_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      // json_object требует объект верхнего уровня — просим массив под ключом hints.
      response_format: { type: 'json_object' },
      temperature: 1.1,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `${buildUserPrompt(snapshot)}\n\nОтветь объектом вида {"hints": [ ... ]}.`,
        },
      ],
    }),
  })) as { choices?: Array<{ message?: { content?: string } }> };

  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq: пустой ответ');
  return parseHints(JSON.parse(content));
}

interface Provider {
  name: ProviderName;
  model: string;
  enabled: boolean;
  run: (snapshot: HintSnapshot) => Promise<LlmHint[]>;
}

function providers(): Provider[] {
  return [
    {
      name: 'gemini',
      // Для логов: какая модель реально ответила, знает только callGemini.
      model: lastGoodGeminiModel ?? GEMINI_MODELS.join('|'),
      enabled: Boolean(process.env.GEMINI_API_KEY),
      run: callGemini,
    },
    {
      name: 'groq',
      model: GROQ_MODEL,
      enabled: Boolean(process.env.GROQ_API_KEY),
      run: callGroq,
    },
  ];
}

/**
 * Gemini → (ошибка/квота) → Groq → (ошибка) → `null`.
 * `null` означает «пул не обновляем», а не «сломались»: вызывающий код остаётся
 * на предыдущем пуле либо на статике.
 */
export async function requestHints(snapshot: HintSnapshot): Promise<LlmResult | null> {
  for (const provider of providers()) {
    if (!provider.enabled) {
      console.info('[hints] llm skip', { provider: provider.name, reason: 'no api key' });
      continue;
    }

    for (let attempt = 1; attempt <= ATTEMPTS_PER_PROVIDER; attempt += 1) {
      const startedAt = Date.now();
      try {
        const hints = await provider.run(snapshot);
        const latencyMs = Date.now() - startedAt;
        console.info('[hints] llm ok', {
          provider: provider.name,
          model: provider.model,
          latencyMs,
          received: hints.length,
        });
        return { provider: provider.name, model: provider.model, hints, latencyMs };
      } catch (error) {
        console.warn('[hints] llm fail', {
          provider: provider.name,
          model: provider.model,
          attempt,
          latencyMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return null;
}
