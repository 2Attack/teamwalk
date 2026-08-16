import { LOCALE } from '@/lib/i18n';

import { CATALOG_EN } from './catalog/en';
import { CATALOG_ES } from './catalog/es';
import { CATALOG_RU } from './catalog/ru';

import type { StaticHint } from './catalog/types';
import type { Locale } from '@/lib/i18n';
import type { HintDto } from '@/lib/types';

/**
 * Static catalog (spec 6.6.6). Never removed; it plays three roles:
 * fallback when the LLM is unavailable, pool filler after strict filtering,
 * and feed content on an empty database when there is nothing to generate.
 *
 * Only categories 4 and 5 live here — absurd statistics and real tips:
 * these phrases need no personal data and are safe at any moment.
 *
 * The catalog is per-locale: `lib/hints/catalog/*` keeps one file per
 * language with identical order and tones; the active one is picked by the
 * deployment-wide locale.
 */

export type { StaticHint } from './catalog/types';

const CATALOGS: Record<Locale, readonly StaticHint[]> = {
  ru: CATALOG_RU,
  en: CATALOG_EN,
  es: CATALOG_ES,
};

export const STATIC_HINTS: readonly StaticHint[] = CATALOGS[LOCALE];

/** A pool row exactly as it is written into `hints_cache`. */
export interface PoolRow {
  text: string;
  tone: string;
  subjectId: string | null;
  source: 'llm' | 'static';
}

/** Static phrases shaped as pool rows — for cache writes and pool top-up. */
export function staticPoolRows(limit = STATIC_HINTS.length): PoolRow[] {
  return STATIC_HINTS.slice(0, Math.max(0, limit)).map((hint) => ({
    text: hint.text,
    tone: hint.tone,
    subjectId: null,
    source: 'static' as const,
  }));
}

/**
 * Static phrases directly as DTOs — when the cache is empty, the user still
 * needs something to see. The ids are synthetic: there are no DB rows.
 */
export function staticHintDtos(limit = STATIC_HINTS.length): HintDto[] {
  return STATIC_HINTS.slice(0, Math.max(0, limit)).map((hint, index) => ({
    id: `static:${index}`,
    tone: hint.tone,
    text: hint.text,
    source: 'static' as const,
  }));
}
