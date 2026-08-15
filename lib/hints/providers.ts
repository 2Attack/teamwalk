import { generateObject } from 'ai';

import { HINTS_LLM_TIMEOUT_MS } from '@/lib/config';
import type { LlmHint } from '@/lib/validation';
import { llmHintSchema } from '@/lib/validation';

import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import type { HintSnapshot } from './snapshot';

/**
 * The only LLM provider — Vercel AI Gateway via the AI SDK (`ai`). The
 * `provider/model` string is routed by the Gateway, which also handles
 * provider fallbacks and retries on retired models — no local candidate loop.
 *
 * Economics: tokens at list price; the $5/month free credits cover our volume
 * with a wide margin (~250 generations/month ≈ $0.3 on Grok).
 *
 * Default is Grok non-reasoning: it fits the "witty captions" genre best among
 * cheap models, and no reasoning means no token budget eaten by it. Tone is
 * backstopped by the post-filter (`filter.ts`), as always.
 *
 * The model is env-configurable: providers retire models without notice, and
 * a failed call must degrade to the previous pool and static catalog
 * (spec § 8), not break the page.
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
 * The AI SDK finds credentials itself: `AI_GATEWAY_API_KEY`, or
 * `VERCEL_OIDC_TOKEN` locally after `vercel env pull`. On Vercel deploys the
 * OIDC token arrives as a request header, not an env var — so with `VERCEL=1`
 * we always try and let the SDK look. Without credentials the call fails and
 * the subsystem lives on the static catalog — the usual degradation.
 */
function gatewayEnabled(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL,
  );
}

/**
 * Shared LLM availability check: route generation (spec § 6.12.4) degrades the
 * same way hints do, so it must ask the same question.
 */
export function llmEnabled(): boolean {
  return gatewayEnabled();
}

/**
 * Gateway → (error/quota/empty) → `null`. `null` means "keep the pool", not
 * "broken": the caller stays on the previous pool or the static catalog.
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
      // Same Zod schema previously used for manual validation: a response
      // failing it is discarded whole, JSON repair is forbidden (spec § 6.6.3).
      schema: llmHintSchema,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(snapshot),
      temperature: 1.1,
      /*
        Reasoning models count thinking against the budget: on a live Gemini
        key 1778 of 2048 tokens went to reasoning and the JSON was cut mid-way.
        The default Grok does not think, but the model is env-configurable —
        keep headroom for any catalog entry.
      */
      maxOutputTokens: 8192,
      // One retry (spec § 8), then the previous pool and static catalog.
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(HINTS_LLM_TIMEOUT_MS),
    });

    const latencyMs = Date.now() - startedAt;
    if (object.length === 0) {
      console.warn('[hints] llm fail', {
        provider: 'gateway',
        model: GATEWAY_MODEL,
        latencyMs,
        error: 'empty response',
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
