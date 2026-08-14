import { waitUntil } from '@vercel/functions';
import { generateObject } from 'ai';
import { z } from 'zod';

import { MAP_GRID_H, MAP_GRID_W, ROUTE_LLM_TIMEOUT_MS, ROUTE_POINTS_MAX } from '@/lib/config';
import { saveMapLayout } from '@/lib/db/queries/routes';
import { GATEWAY_MODEL, llmEnabled } from '@/lib/hints/providers';
import { normalizeLayout } from '@/lib/map/layout';
import type { MapLayoutDto, RouteCityDto, RouteDraftDto } from '@/lib/types';
import { mapLayoutSchema, routePointsSchema, treadmillNameSchema } from '@/lib/validation';

/**
 * LLM helpers of the route feature (spec § 6.12.4, 6.12.5). Both return null
 * on any failure — the callers degrade: the editor stays manual, the map
 * falls back to the deterministic layout. The model's output never reaches
 * the DB or the UI without passing the same Zod validation as manual input.
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

/**
 * Background map generation after a route save (spec § 6.12.5): runs via
 * waitUntil after the response, never in the hot path, never throws. Without
 * LLM credentials it is a no-op — the deterministic layout serves the map.
 */
export function scheduleMapLayout(routeId: string, points: RouteCityDto[]): void {
  if (!llmEnabled()) return;
  waitUntil(
    generateMapLayout(points)
      .then(async (layout) => {
        if (layout) await saveMapLayout(routeId, layout);
      })
      .catch((error) => {
        console.warn('[routes] background layout failed', {
          routeId,
          error: error instanceof Error ? error.message : String(error),
        });
      }),
  );
}

const LAYOUT_SYSTEM_PROMPT = `Ты раскладываешь пиксельную карту-свиток офисного трекера ходьбы.
Дана последовательность городов маршрута. Расставь их на целочисленной сетке ${MAP_GRID_W}×${MAP_GRID_H} (x вправо, y вниз) так, чтобы взаимное расположение напоминало реальную географию, а тропа шла без самопересечений.
Правила:
- каждый город маршрута — ровно один раз, координаты с отступом от краёв 6+ клеток;
- bends — необязательные изгибы тропы между городом after и следующим, не больше трёх на отрезок;
- decor — украшения из каталога tree/mountain/lake/house/anchor вдали от городов и тропы, до 20 штук: лес и горы там, где они уместны географически, lake у воды, anchor у морей;
- ответ строго по схеме, без пояснений.`;

/**
 * Map layout for a route (spec § 6.12.5): the LLM proposes positions, the
 * post-filter (`normalizeLayout`) makes them safe. Null on any failure.
 */
export async function generateMapLayout(points: RouteCityDto[]): Promise<MapLayoutDto | null> {
  const startedAt = Date.now();
  try {
    const { object } = await generateObject({
      model: GATEWAY_MODEL,
      schema: mapLayoutSchema,
      system: LAYOUT_SYSTEM_PROMPT,
      prompt: `Города маршрута по порядку: ${points.map((p) => `${p.city} (${p.km} км)`).join(' → ')}.`,
      temperature: 0.6,
      maxOutputTokens: 4096,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(ROUTE_LLM_TIMEOUT_MS),
    });

    const layout = normalizeLayout(object, points);
    if (!layout) {
      console.warn('[routes] llm layout rejected', {
        model: GATEWAY_MODEL,
        latencyMs: Date.now() - startedAt,
      });
      return null;
    }

    console.info('[routes] llm layout ok', {
      model: GATEWAY_MODEL,
      latencyMs: Date.now() - startedAt,
      decor: layout.decor.length,
    });
    return layout;
  } catch (error) {
    console.warn('[routes] llm layout fail', {
      model: GATEWAY_MODEL,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
