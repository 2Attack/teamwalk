import { generateObject } from 'ai';
import { z } from 'zod';

import { ROUTE_LLM_TIMEOUT_MS, ROUTE_POINTS_MAX } from '@/lib/config';
import { GATEWAY_MODEL } from '@/lib/hints/providers';
import { INTL_LOCALE, LOCALE } from '@/lib/i18n';
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

/** Per-locale system prompts: city names must come back in the app language. */
const DRAFT_SYSTEM_PROMPTS = {
  ru: `Ты помощник офисного трекера ходьбы. Команда идёт виртуальный маршрут по карте.
По описанию пользователя составь маршрут: короткое название и список городов.
Правила:
- город старта — первый, с km = 0;
- km — накопительное расстояние от старта по автодорогам, в километрах, целое, округляй до десятков;
- km строго возрастают, города не повторяются;
- от 2 до ${ROUTE_POINTS_MAX} точек; для длинных маршрутов выбирай по одному городу на страну или регион;
- названия городов — по-русски, как принято на картах;
- расстояния ориентировочные, это игровая метафора, а не навигация.`,
  en: `You are the assistant of an office walking tracker. The team walks a virtual route on a map.
From the user's description compose a route: a short name and a list of cities.
Rules:
- the start city goes first, with km = 0;
- km is the cumulative road distance from the start, in kilometers, integer, rounded to tens;
- km strictly increases, cities never repeat;
- 2 to ${ROUTE_POINTS_MAX} points; for long routes pick one city per country or region;
- city names in English, as commonly shown on maps;
- distances are approximate — this is a game metaphor, not navigation.`,
  es: `Eres el asistente de un contador de caminatas de oficina. El equipo recorre una ruta virtual en el mapa.
A partir de la descripción del usuario, compón una ruta: un nombre corto y una lista de ciudades.
Reglas:
- la ciudad de salida va primero, con km = 0;
- km es la distancia acumulada por carretera desde la salida, en kilómetros, entero, redondeado a decenas;
- los km crecen estrictamente, las ciudades no se repiten;
- de 2 a ${ROUTE_POINTS_MAX} puntos; en rutas largas elige una ciudad por país o región;
- nombres de ciudades en español, como aparecen en los mapas;
- las distancias son orientativas: es una metáfora de juego, no navegación.`,
} as const;

const DRAFT_SYSTEM_PROMPT = DRAFT_SYSTEM_PROMPTS[LOCALE];

/** User-prompt templates in the app language. */
const DRAFT_USER_PROMPTS = {
  ru: {
    withCities: (cities: string, context: string) =>
      `Города уже выбраны, пересчитай только накопительные километры и предложи название. Города по порядку: ${cities}. Контекст: ${context}`,
    fromScratch: (context: string) => `Составь маршрут: ${context}`,
  },
  en: {
    withCities: (cities: string, context: string) =>
      `The cities are already chosen — only recompute cumulative kilometers and suggest a name. Cities in order: ${cities}. Context: ${context}`,
    fromScratch: (context: string) => `Compose a route: ${context}`,
  },
  es: {
    withCities: (cities: string, context: string) =>
      `Las ciudades ya están elegidas: recalcula solo los kilómetros acumulados y propón un nombre. Ciudades en orden: ${cities}. Contexto: ${context}`,
    fromScratch: (context: string) => `Compón una ruta: ${context}`,
  },
} as const;

const DRAFT_USER_PROMPT = DRAFT_USER_PROMPTS[LOCALE];

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
        ? DRAFT_USER_PROMPT.withCities(cities.join(', '), prompt)
        : DRAFT_USER_PROMPT.fromScratch(prompt),
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
      const key = city.data.toLocaleLowerCase(INTL_LOCALE);
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
