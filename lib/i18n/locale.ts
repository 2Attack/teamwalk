/**
 * App locale. Deployment-wide, set via `NEXT_PUBLIC_LOCALE` (en | ru | es).
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so the constant works in client
 * components too; server code reads the same variable at runtime. Changing the
 * variable requires a redeploy — otherwise the client bundle keeps the old
 * locale while the server switches to the new one.
 */

export const SUPPORTED_LOCALES = ['en', 'ru', 'es'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

function isLocale(value: string | undefined): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '');
}

const raw = process.env.NEXT_PUBLIC_LOCALE;

/** Active locale. An unknown or missing value falls back to the default. */
export const LOCALE: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

/** BCP 47 tag for `Intl.*` formatters. */
export const INTL_LOCALE: string = { en: 'en-US', ru: 'ru-RU', es: 'es-ES' }[LOCALE];