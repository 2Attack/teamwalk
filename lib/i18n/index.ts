import { INTL_LOCALE, LOCALE } from './locale';
import { en } from './messages/en';
import { es } from './messages/es';
import { ru } from './messages/ru';

import type { Messages } from './messages/ru';

export { LOCALE, INTL_LOCALE, DEFAULT_LOCALE, SUPPORTED_LOCALES } from './locale';
export type { Locale } from './locale';
export type { Messages, PluralForms } from './messages/ru';

const ALL: Record<string, Messages> = { en, es, ru };

/**
 * Messages of the active locale. Typed access instead of string keys:
 * `m.finishWalk.title` — a typo is a compile error, not a runtime fallback.
 */
export const m: Messages = ALL[LOCALE];

/** `fmt('Максимум {max} км', { max: 50 })` → `Максимум 50 км`. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

const pluralRules = new Intl.PluralRules(INTL_LOCALE);

/**
 * Plural form pick via CLDR rules: `plural(m.units.day, 5)` → `дней`.
 * A locale may omit forms it does not distinguish — `other` is the fallback.
 */
export function plural(
  forms: { one?: string; few?: string; many?: string; other: string },
  count: number,
  params?: Record<string, string | number>,
): string {
  const category = pluralRules.select(count);
  const form =
    (category === 'one' && forms.one) ||
    (category === 'few' && forms.few) ||
    (category === 'many' && forms.many) ||
    forms.other;
  return fmt(form, { count, ...params });
}
