import { generateObject } from 'ai';

import { HINTS_LLM_TIMEOUT_MS } from '@/lib/config';
import type { LlmHint } from '@/lib/validation';
import { llmHintSchema } from '@/lib/validation';

import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import type { HintSnapshot } from './snapshot';

/**
 * Единственный LLM-провайдер — Vercel AI Gateway через AI SDK (`ai`).
 * Строка `provider/model` роутится через Gateway автоматически; фолбэки между
 * провайдерами и ретраи на снятых моделях Gateway делает на своей стороне,
 * поэтому перебор моделей-кандидатов, живший здесь раньше, больше не нужен.
 *
 * Экономика: наценки на токены нет (list price), $5/мес бесплатных кредитов
 * покрывают наш объём с большим запасом (~250 генераций/мес ≈ $0.3 на Grok).
 *
 * Дефолт — Grok non-reasoning: жанр «шутливые подписи» ему ближе всех дешёвых
 * моделей, а отсутствие «размышлений» снимает проблему сожранного ими бюджета
 * токенов. Резкость тона страхует постфильтр (`filter.ts`) — как и всегда.
 *
 * Модель выносится в env: тарифы снимают модели без предупреждения, и падение
 * вызова обязано деградировать до прошлого пула и статики (п. 8), а не ронять
 * страницу.
 */
export const GATEWAY_MODEL = process.env.AI_GATEWAY_MODEL ?? 'xai/grok-4.1-fast-non-reasoning';

export type ProviderName = 'gateway';

export interface LlmResult {
  provider: ProviderName;
  model: string;
  hints: LlmHint[];
  latencyMs: number;
}

/**
 * AI SDK сам находит креды: `AI_GATEWAY_API_KEY` либо `VERCEL_OIDC_TOKEN`
 * (последний Vercel подставляет на деплоях автоматически). Без обоих подсистема
 * молча живёт на статическом каталоге — та же деградация, что была без ключей.
 */
function gatewayEnabled(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/**
 * Gateway → (ошибка/квота/пусто) → `null`.
 * `null` означает «пул не обновляем», а не «сломались»: вызывающий код остаётся
 * на предыдущем пуле либо на статике.
 */
export async function requestHints(snapshot: HintSnapshot): Promise<LlmResult | null> {
  if (!gatewayEnabled()) {
    console.info('[hints] llm skip', { provider: 'gateway', reason: 'no credentials' });
    return null;
  }

  const startedAt = Date.now();
  try {
    const { object } = await generateObject({
      model: GATEWAY_MODEL,
      output: 'array',
      // Схема ответа — та же Zod-схема, которой раньше валидировали руками:
      // ответ, не прошедший её, отбрасывается целиком, чинить JSON запрещено (п. 6.6.3).
      schema: llmHintSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(snapshot),
      temperature: 1.1,
      /*
        У «думающих» моделей бюджет считается вместе с размышлениями: на живом
        ключе Gemini из 2048 токенов 1778 уходило в них, ответ обрывался на
        середине JSON. Дефолтный Grok non-reasoning не думает, но модель
        задаётся env-переменной — запас держим под любую из каталога.
      */
      maxOutputTokens: 8192,
      // Одна повторная попытка (п. 8), дальше — прошлый пул и статика.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(HINTS_LLM_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - startedAt;
    if (object.length === 0) {
      console.warn('[hints] llm fail', {
        provider: 'gateway',
        model: GATEWAY_MODEL,
        latencyMs,
        error: 'пустой ответ',
      });
      return null;
    }

    console.info('[hints] llm ok', {
      provider: 'gateway',
      model: GATEWAY_MODEL,
      latencyMs,
      received: object.length,
    });
    return { provider: 'gateway', model: GATEWAY_MODEL, hints: object, latencyMs };
  } catch (error) {
    console.warn('[hints] llm fail', {
      provider: 'gateway',
      model: GATEWAY_MODEL,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
