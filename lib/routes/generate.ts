import { generateObject } from 'ai';
import { z } from 'zod';

import { ROUTE_LLM_TIMEOUT_MS, ROUTE_POINTS_MAX } from '@/lib/config';
import { GATEWAY_MODEL } from '@/lib/hints/providers';
import type { RouteCityDto, RouteDraftDto } from '@/lib/types';
import { routePointsSchema, treadmillNameSchema } from '@/lib/validation';

/**
 * LLM helper of the route feature (spec § 6.12.4). Returns null on any
 * failure — the caller degrades and the editor stays manual. The model's
 * output never reaches the DB or the UI without passing the same Zod
 * validation as manual input.
 */

/** Loose response shape for the draft; the strict rules run after normalization. */
const draftResponseSchema = z.object({
  name: z.string().min(1).max(120),
  points: z
    .array(z.object({ city: z.string().min(1).max(120), km: z.number() }))
    .min(2)
    .max(ROUTE_POINTS_MAX * 2),
});

const DRAFT_SYSTEM_PROMPT = `Ты помощник офисного трекера ходьбы. Команда идёт виртуальный маршрут по карте.
По описанию пользователя составь маршрут: короткое название и список городов.
Правила:
- город старта — первый, с km = 0;
- km — накопительное расстояние от старта по автодорогам, в километрах, целое, округляй до десятков;
- km строго возрастают, города не повторяются;
- от 2 до ${ROUTE_POINTS_MAX} точек; для длинных маршрутов выбирай по одному городу на страну или регион;
- названия городов — по-русски, как принято на картах;
- расстояния ориентировочные, это игровая метафора, а не навигация.`;

/**
 * Route draft by description (spec § 6.12.4). The result is normalized (sort,
 * dedupe, clamp count) and must pass `routePointsSchema` — otherwise null.
 */
export async function generateRouteDraft(
  prompt: string,
  cities?: string[],
): Promise<RouteDraftDto | null> {
  const startedAt = Date.now();
  try {
    const { object } = await generateObject({
      model: GATEWAY_MODEL,
      schema: draftResponseSchema,
      system: DRAFT_SYSTEM_PROMPT,
      prompt: cities?.length
        ? `Города уже выбраны, пересчитай только накопительные километры и предложи название. Города по порядку: ${cities.join(', ')}. Контекст: ${prompt}`
        : `Составь маршрут: ${prompt}`,
      temperature: 0.7,
      maxOutputTokens: 4096,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(ROUTE_LLM_TIMEOUT_MS),
    });

    const name = treadmillNameSchema.safeParse(object.name);
    if (!name.success) return null;

    // Normalize before the strict schema: round km, force the start to 0,
    // sort, drop duplicates — the model's arithmetic is only approximate.
    const seen = new Set<string>();
    const cleaned: RouteCityDto[] = [];
    for (const point of object.points) {
      const city = treadmillNameSchema.safeParse(point.city);
      if (!city.success) continue;
      const key = city.data.toLocaleLowerCase('ru-RU');
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push({ city: city.data, km: Math.max(0, Math.round(point.km)) });
    }
    cleaned.sort((a, b) => a.km - b.km);
    if (cleaned.length > 0) cleaned[0] = { ...cleaned[0], km: 0 };

    const points = routePointsSchema.safeParse(cleaned.slice(0, ROUTE_POINTS_MAX));
    if (!points.success) {
      console.warn('[routes] llm draft rejected', {
        model: GATEWAY_MODEL,
        latencyMs: Date.now() - startedAt,
        error: points.error.issues[0]?.message,
      });
      return null;
    }

    console.info('[routes] llm draft ok', {
      model: GATEWAY_MODEL,
      latencyMs: Date.now() - startedAt,
      points: points.data.length,
    });
    return { name: name.data, points: points.data };
  } catch (error) {
    console.warn('[routes] llm draft fail', {
      model: GATEWAY_MODEL,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
