import { z } from 'zod';

import { AVATAR_IDS } from './avatars';
import {
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
import { fmt, INTL_LOCALE, m } from './i18n';

/** Zod schemas — the same ones on the client and in the API. */

/** Letters (Cyrillic/Latin), digits, space, hyphen, apostrophe, dot. */
const NAME_ALLOWED = /^[\p{L}\p{Nd} '.\-]+$/u;

export const nameSchema = z
  .string()
  .transform((v) => normalizeName(v))
  .refine((v) => v.length >= 2 && v.length <= 60, {
    message: m.validation.nameLength,
  })
  .refine((v) => NAME_ALLOWED.test(v), {
    message: m.validation.nameChars,
  });

export const avatarIdSchema = z.enum(AVATAR_IDS as unknown as [string, ...string[]], {
  message: m.validation.unknownAvatar,
});

export const uuidSchema = z.uuid({ message: m.validation.invalidId });

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
    message: m.validation.nothingToUpdate,
  });

export const speedSchema = z
  .number()
  .int({ message: m.validation.speedInteger })
  .min(MIN_SPEED_KMH, { message: fmt(m.validation.minKmh, { min: MIN_SPEED_KMH }) })
  .max(MAX_SPEED_KMH_ABS, { message: fmt(m.validation.maxKmh, { max: MAX_SPEED_KMH_ABS }) });

export const startWalkSchema = z.object({
  userId: uuidSchema,
  speedKmh: speedSchema,
  treadmillId: uuidSchema.optional(),
});

/** Mid-walk speed change: the same bounds as at start. */
export const changeSpeedSchema = z.object({
  speedKmh: speedSchema,
});

/**
 * Treadmill CRUD on the settings screen. The speed ceiling uses
 * the DB sanity bounds; the name follows the participant-name rules
 * except title-casing: «У окна» must not become «У Окна». Case-insensitive
 * uniqueness is enforced by the `treadmills_name_uniq` index.
 */
export const treadmillNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .refine((v) => v.length >= 2 && v.length <= 60, {
    message: m.validation.titleLength,
  })
  .refine((v) => NAME_ALLOWED.test(v), {
    message: m.validation.nameChars,
  });

export const treadmillMaxSpeedSchema = z
  .number()
  .int({ message: m.validation.speedCeilingInteger })
  .min(MIN_SPEED_KMH, { message: fmt(m.validation.minKmh, { min: MIN_SPEED_KMH }) })
  .max(MAX_SPEED_KMH_ABS, { message: fmt(m.validation.maxKmh, { max: MAX_SPEED_KMH_ABS }) });

export const treadmillSortOrderSchema = z
  .number()
  .int({ message: m.validation.orderInteger })
  .min(TREADMILL_SORT_ORDER_MIN, { message: fmt(m.validation.min, { min: TREADMILL_SORT_ORDER_MIN }) })
  .max(TREADMILL_SORT_ORDER_MAX, { message: fmt(m.validation.max, { max: TREADMILL_SORT_ORDER_MAX }) });

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
    message: m.validation.nothingToUpdate,
  });

/**
 * Team routes. City and route names follow the treadmill-name
 * rules (2–60 chars, whitespace collapse, no title-casing). Points: the first
 * is the start at km 0, km strictly increase, cities are unique, 2–20 points.
 */
export const routePointSchema = z.object({
  city: treadmillNameSchema,
  km: z
    .number()
    .int({ message: m.validation.kmInteger })
    .min(0, { message: m.validation.kmNegative })
    .max(ROUTE_POINT_KM_MAX, { message: fmt(m.validation.maxKm, { max: ROUTE_POINT_KM_MAX }) }),
});

export const routePointsSchema = z
  .array(routePointSchema)
  .min(ROUTE_POINTS_MIN, { message: fmt(m.validation.routePointsMin, { min: ROUTE_POINTS_MIN }) })
  .max(ROUTE_POINTS_MAX, { message: fmt(m.validation.routePointsMax, { max: ROUTE_POINTS_MAX }) })
  .refine((points) => points[0]?.km === 0, {
    message: m.validation.routeStartsAtZero,
  })
  .refine((points) => points.every((p, i) => i === 0 || p.km > points[i - 1].km), {
    message: m.validation.kmStrictlyIncreasing,
  })
  .refine(
    (points) =>
      new Set(points.map((p) => p.city.toLocaleLowerCase(INTL_LOCALE))).size === points.length,
    { message: m.validation.citiesUnique },
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
    message: m.validation.nothingToUpdate,
  });

export const activateRouteSchema = z.object({
  resetProgress: z.boolean(),
});

/** Request of `POST /api/routes/generate`. */
export const generateRouteSchema = z.object({
  prompt: z
    .string()
    .transform((v) => v.trim())
    .refine((v) => v.length >= 3 && v.length <= 300, {
      message: m.validation.describeRoute,
    }),
  cities: z.array(treadmillNameSchema).max(ROUTE_POINTS_MAX).optional(),
});

/** Distance: 0.01–50.00, step 0.01. Dot and comma are both accepted at the UI level. */
export const distanceSchema = z
  .number()
  .min(MIN_DISTANCE_KM, { message: fmt(m.validation.minKm, { min: MIN_DISTANCE_KM }) })
  .max(MAX_DISTANCE_KM, { message: fmt(m.validation.maxKm, { max: MAX_DISTANCE_KM }) })
  .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(0)), {
    message: m.validation.distanceStep,
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
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: m.validation.dateFormat })
  .refine(
    (v) => {
      const [y, m, d] = v.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      return (
        date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      );
    },
    { message: m.validation.dateInvalid },
  );

/**
 * Leaderboard period selection: a preset or a custom range of office days
 * (both bounds inclusive). One schema for the client and the API.
 */
export const periodSelectionSchema = z.union([
  z
    .object({
      period: z.literal('custom'),
      from: officeDaySchema,
      to: officeDaySchema,
    })
    .refine((v) => v.from <= v.to, {
      message: m.validation.periodInverted,
      path: ['from'],
    }),
  z.object({ period: periodSchema }),
]);
export type PeriodSelection = z.infer<typeof periodSelectionSchema>;

/**
 * Custom window of the per-user daily chart (both bounds inclusive).
 * Capped to a year: the series is zero-filled per day, and an unbounded
 * range would balloon the response for no chart benefit.
 */
export const dailyRangeSchema = z
  .object({ from: officeDaySchema, to: officeDaySchema })
  .refine((v) => v.from <= v.to, {
    message: m.validation.periodInverted,
    path: ['from'],
  })
  .refine((v) => Date.parse(v.to) - Date.parse(v.from) < 366 * 86_400_000, {
    message: m.validation.rangeTooLong,
    path: ['to'],
  });

/** LLM response with hints. */
export const hintToneSchema = z.enum(['praise', 'tease', 'neutral', 'tip']);

export const llmHintSchema = z.object({
  text: z.string().min(1).max(240),
  tone: hintToneSchema,
  subject: z.string().nullable().optional(),
});

export const llmHintsSchema = z.array(llmHintSchema).min(1);

export type LlmHint = z.infer<typeof llmHintSchema>;
export type HintTone = z.infer<typeof hintToneSchema>;

/**
 * Access-gate unlock body. Deliberately loose (any non-empty string ≤ 128):
 * the endpoint maps schema failures to the same generic PIN_INVALID as a
 * wrong PIN — no format hints leave the server.
 */
export const pinVerifySchema = z.object({
  pin: z.string().trim().min(1).max(128),
});
