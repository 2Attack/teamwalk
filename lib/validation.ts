import { z } from 'zod';

import { AVATAR_IDS } from './avatars';
import {
  MAP_BENDS_PER_SEGMENT_MAX,
  MAP_DECOR_MAX,
  MAP_GRID_H,
  MAP_GRID_W,
  MAX_DISTANCE_KM,
  MAX_SPEED_KMH_ABS,
  MIN_DISTANCE_KM,
  MIN_SPEED_KMH,
  ROUTE_POINT_KM_MAX,
  ROUTE_POINTS_MAX,
  ROUTE_POINTS_MIN,
  TREADMILL_SORT_ORDER_MAX,
  TREADMILL_SORT_ORDER_MIN,
} from './config';
import { normalizeName } from './format';

/** Zod schemas — the same ones on the client and in the API (spec § 3). */

/** Letters (Cyrillic/Latin), digits, space, hyphen, apostrophe, dot (spec § 6.2). */
const NAME_ALLOWED = /^[\p{L}\p{Nd} '.\-]+$/u;

export const nameSchema = z
  .string()
  .transform((v) => normalizeName(v))
  .refine((v) => v.length >= 2 && v.length <= 60, {
    message: 'Имя должно быть от 2 до 60 символов',
  })
  .refine((v) => NAME_ALLOWED.test(v), {
    message: 'Допустимы только буквы, цифры, пробел, дефис, апостроф и точка',
  });

export const avatarIdSchema = z.enum(AVATAR_IDS as unknown as [string, ...string[]], {
  message: 'Неизвестный персонаж',
});

export const uuidSchema = z.uuid({ message: 'Некорректный идентификатор' });

export const createUserSchema = z.object({
  name: nameSchema,
  avatarId: avatarIdSchema,
});

export const patchUserSchema = z
  .object({
    name: nameSchema.optional(),
    avatarId: avatarIdSchema.optional(),
    hintsOptOut: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.avatarId !== undefined || v.hintsOptOut !== undefined, {
    message: 'Нечего обновлять',
  });

export const speedSchema = z
  .number()
  .int({ message: 'Скорость — целое число' })
  .min(MIN_SPEED_KMH, { message: `Минимум ${MIN_SPEED_KMH} км/ч` })
  .max(MAX_SPEED_KMH_ABS, { message: `Максимум ${MAX_SPEED_KMH_ABS} км/ч` });

export const startWalkSchema = z.object({
  userId: uuidSchema,
  speedKmh: speedSchema,
  treadmillId: uuidSchema.optional(),
});

/** Mid-walk speed change (spec § 6.3): the same bounds as at start. */
export const changeSpeedSchema = z.object({
  speedKmh: speedSchema,
});

/**
 * Treadmill CRUD on the settings screen (spec § 6.11.3). The speed ceiling uses
 * the DB sanity bounds (spec § 4.2); the name follows the participant-name rules
 * except title-casing: «У окна» must not become «У Окна». Case-insensitive
 * uniqueness is enforced by the `treadmills_name_uniq` index.
 */
export const treadmillNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .refine((v) => v.length >= 2 && v.length <= 60, {
    message: 'Название должно быть от 2 до 60 символов',
  })
  .refine((v) => NAME_ALLOWED.test(v), {
    message: 'Допустимы только буквы, цифры, пробел, дефис, апостроф и точка',
  });

export const treadmillMaxSpeedSchema = z
  .number()
  .int({ message: 'Потолок скорости — целое число' })
  .min(MIN_SPEED_KMH, { message: `Минимум ${MIN_SPEED_KMH} км/ч` })
  .max(MAX_SPEED_KMH_ABS, { message: `Максимум ${MAX_SPEED_KMH_ABS} км/ч` });

export const treadmillSortOrderSchema = z
  .number()
  .int({ message: 'Порядок — целое число' })
  .min(TREADMILL_SORT_ORDER_MIN, { message: `Минимум ${TREADMILL_SORT_ORDER_MIN}` })
  .max(TREADMILL_SORT_ORDER_MAX, { message: `Максимум ${TREADMILL_SORT_ORDER_MAX}` });

export const createTreadmillSchema = z.object({
  name: treadmillNameSchema,
  maxSpeedKmh: treadmillMaxSpeedSchema,
  sortOrder: treadmillSortOrderSchema.optional(),
});

export const patchTreadmillSchema = z
  .object({
    name: treadmillNameSchema.optional(),
    maxSpeedKmh: treadmillMaxSpeedSchema.optional(),
    sortOrder: treadmillSortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Нечего обновлять',
  });

/**
 * Team routes (spec § 6.12.2). City and route names follow the treadmill-name
 * rules (2–60 chars, whitespace collapse, no title-casing). Points: the first
 * is the start at km 0, km strictly increase, cities are unique, 2–20 points.
 */
export const routePointSchema = z.object({
  city: treadmillNameSchema,
  km: z
    .number()
    .int({ message: 'Километры — целое число' })
    .min(0, { message: 'Километры не могут быть отрицательными' })
    .max(ROUTE_POINT_KM_MAX, { message: `Максимум ${ROUTE_POINT_KM_MAX} км` }),
});

export const routePointsSchema = z
  .array(routePointSchema)
  .min(ROUTE_POINTS_MIN, { message: `Минимум ${ROUTE_POINTS_MIN} точки: старт и цель` })
  .max(ROUTE_POINTS_MAX, { message: `Максимум ${ROUTE_POINTS_MAX} точек` })
  .refine((points) => points[0]?.km === 0, {
    message: 'Маршрут начинается со старта — точки с 0 км',
  })
  .refine((points) => points.every((p, i) => i === 0 || p.km > points[i - 1].km), {
    message: 'Километры должны строго возрастать',
  })
  .refine(
    (points) =>
      new Set(points.map((p) => p.city.toLocaleLowerCase('ru-RU'))).size === points.length,
    { message: 'Города в маршруте не должны повторяться' },
  );

export const createRouteSchema = z.object({
  name: treadmillNameSchema,
  points: routePointsSchema,
});

export const patchRouteSchema = z
  .object({
    name: treadmillNameSchema.optional(),
    points: routePointsSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.points !== undefined, {
    message: 'Нечего обновлять',
  });

export const activateRouteSchema = z.object({
  resetProgress: z.boolean(),
});

/** Request of `POST /api/routes/generate` (spec § 6.12.4). */
export const generateRouteSchema = z.object({
  prompt: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= 3 && v.length <= 300, {
      message: 'Опишите маршрут (от 3 до 300 символов)',
    }),
  cities: z.array(treadmillNameSchema).max(ROUTE_POINTS_MAX).optional(),
});

/**
 * Pixel-map layout (spec § 6.12.5) — validates both LLM output and stored
 * jsonb. Coordinate bounds match the MAP_GRID_W × MAP_GRID_H grid; caps keep a
 * hallucinating model from flooding the map.
 */
const mapCoord = (max: number) => z.number().int().min(0).max(max);

export const mapLayoutSchema = z.object({
  cities: z
    .array(z.object({ city: z.string().min(1).max(60), x: mapCoord(MAP_GRID_W), y: mapCoord(MAP_GRID_H) }))
    .min(ROUTE_POINTS_MIN)
    .max(ROUTE_POINTS_MAX),
  bends: z
    .array(z.object({ after: z.string().min(1).max(60), x: mapCoord(MAP_GRID_W), y: mapCoord(MAP_GRID_H) }))
    .max(ROUTE_POINTS_MAX * MAP_BENDS_PER_SEGMENT_MAX),
  decor: z
    .array(
      z.object({
        kind: z.enum(['tree', 'mountain', 'lake', 'house', 'anchor']),
        x: mapCoord(MAP_GRID_W),
        y: mapCoord(MAP_GRID_H),
      }),
    )
    .max(MAP_DECOR_MAX),
});

/** Distance: 0.01–50.00, step 0.01. Dot and comma are both accepted at the UI level. */
export const distanceSchema = z
  .number()
  .min(MIN_DISTANCE_KM, { message: `Минимум ${MIN_DISTANCE_KM} км` })
  .max(MAX_DISTANCE_KM, { message: `Максимум ${MAX_DISTANCE_KM} км` })
  .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(0)), {
    message: 'Шаг — 0.01 км',
  });

export const finishWalkSchema = z.object({
  distanceKm: distanceSchema,
});

export const periodSchema = z.enum(['week', 'month', 'all']).default('week');
export type Period = z.infer<typeof periodSchema>;

/**
 * Office day `YYYY-MM-DD` — a boundary of a custom leaderboard period.
 * Nonexistent dates are caught by a component round-trip: `Date.parse` is not
 * suitable — V8 silently rolls `2026-02-31` over into March 3.
 */
export const officeDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата — в формате ГГГГ-ММ-ДД' })
  .refine(
    (v) => {
      const [y, m, d] = v.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return (
        date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      );
    },
    { message: 'Несуществующая дата' },
  );

/**
 * Leaderboard period selection: a preset or a custom range of office days
 * (both bounds inclusive). One schema for the client and the API (spec § 3).
 */
export const periodSelectionSchema = z.union([
  z
    .object({
      period: z.literal('custom'),
      from: officeDaySchema,
      to: officeDaySchema,
    })
    .refine((v) => v.from <= v.to, {
      message: 'Начало периода позже его конца',
      path: ['from'],
    }),
  z.object({ period: periodSchema }),
]);
export type PeriodSelection = z.infer<typeof periodSelectionSchema>;

/** LLM response with hints (spec § 6.6.3). */
export const hintToneSchema = z.enum(['praise', 'tease', 'neutral', 'tip']);

export const llmHintSchema = z.object({
  text: z.string().min(1).max(240),
  tone: hintToneSchema,
  subject: z.string().nullable().optional(),
});

export const llmHintsSchema = z.array(llmHintSchema).min(1);

export type LlmHint = z.infer<typeof llmHintSchema>;
export type HintTone = z.infer<typeof hintToneSchema>;
