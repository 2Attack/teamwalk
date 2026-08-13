import { z } from 'zod';

import { AVATAR_IDS } from './avatars';
import {
  MAX_DISTANCE_KM,
  MAX_SPEED_KMH_ABS,
  MIN_DISTANCE_KM,
  MIN_SPEED_KMH,
} from './config';
import { normalizeName } from './format';

/** Zod-схемы — одни и те же на клиенте и в API (п. 3 ТЗ). */

/** Буквы (кириллица/латиница), цифры, пробел, дефис, апостроф, точка (п. 6.2). */
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

/** Смена скорости на ходу (п. 6.3): границы те же, что на старте. */
export const changeSpeedSchema = z.object({
  speedKmh: speedSchema,
});

/** Дистанция: 0.01–50.00, шаг 0.01. Точка и запятая принимаются на уровне UI. */
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
 * Офисный день `YYYY-MM-DD` — граница произвольного периода рейтинга.
 * Несуществующие даты ловятся раунд-трипом по компонентам: `Date.parse`
 * не годится — V8 молча перекатывает `2026-02-31` в 3 марта.
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
 * Выбор периода рейтинга: предустановленный или произвольный диапазон офисных
 * дней (обе границы включительно). Одна схема на клиент и API (п. 3 ТЗ).
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

/** Ответ LLM с хинтами (п. 6.6.3). */
export const hintToneSchema = z.enum(['praise', 'tease', 'neutral', 'tip']);

export const llmHintSchema = z.object({
  text: z.string().min(1).max(240),
  tone: hintToneSchema,
  subject: z.string().nullable().optional(),
});

export const llmHintsSchema = z.array(llmHintSchema).min(1);

export type LlmHint = z.infer<typeof llmHintSchema>;
export type HintTone = z.infer<typeof hintToneSchema>;
