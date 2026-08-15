import { describe, expect, it, vi } from 'vitest';

import { fmt, plural } from '@/lib/i18n';
import { en } from '@/lib/i18n/messages/en';
import { es } from '@/lib/i18n/messages/es';
import { ru, type PluralForms } from '@/lib/i18n/messages/ru';

describe('fmt', () => {
  it('substitutes named params', () => {
    expect(fmt('Максимум {max} км', { max: 50 })).toBe('Максимум 50 км');
    expect(fmt('{a} + {b}', { a: 1, b: '2' })).toBe('1 + 2');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(fmt('до {city} {left} км', { left: 12 })).toBe('до {city} 12 км');
  });
});

describe('plural (test env pins locale to ru)', () => {
  const day: PluralForms = { one: 'день', few: 'дня', many: 'дней', other: 'дней' };

  it('picks Russian CLDR categories', () => {
    expect(plural(day, 1)).toBe('день');
    expect(plural(day, 2)).toBe('дня');
    expect(plural(day, 5)).toBe('дней');
    expect(plural(day, 11)).toBe('дней');
    expect(plural(day, 21)).toBe('день');
    expect(plural(day, 104)).toBe('дня');
  });

  it('interpolates {count} and extra params', () => {
    const label: PluralForms = {
      one: 'Серия: {count} день',
      few: 'Серия: {count} дня',
      many: 'Серия: {count} дней',
      other: 'Серия: {count} дней',
    };
    expect(plural(label, 3)).toBe('Серия: 3 дня');
  });

  it('falls back to `other` when a category form is missing', () => {
    expect(plural({ other: 'days' }, 1)).toBe('days');
  });
});

describe('locale resolution', () => {
  async function localeWithEnv(value: string | undefined): Promise<string> {
    vi.resetModules();
    if (value === undefined) vi.stubEnv('NEXT_PUBLIC_LOCALE', undefined);
    else vi.stubEnv('NEXT_PUBLIC_LOCALE', value);
    try {
      const mod = await import('@/lib/i18n/locale');
      return mod.LOCALE;
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  }

  it('defaults to en when the variable is missing', async () => {
    expect(await localeWithEnv(undefined)).toBe('en');
  });

  it('falls back to en on an unknown value', async () => {
    expect(await localeWithEnv('de')).toBe('en');
  });

  it('honors an explicit supported locale', async () => {
    expect(await localeWithEnv('es')).toBe('es');
    expect(await localeWithEnv('ru')).toBe('ru');
  });
});

type Tree = { [key: string]: string | PluralForms | Tree };

function isPluralForms(value: object): value is PluralForms {
  return typeof (value as PluralForms).other === 'string';
}

/** Flattens a message tree into `path → template` pairs (plural forms included). */
function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      out.set(path, value);
    } else if (isPluralForms(value)) {
      for (const [form, template] of Object.entries(value)) {
        if (typeof template === 'string') out.set(`${path}#${form}`, template);
      }
    } else {
      for (const [innerPath, template] of flatten(value, path)) out.set(innerPath, template);
    }
  }
  return out;
}

function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe.each([
  ['en', en],
  ['es', es],
])('dictionary parity: %s vs ru', (_name, locale) => {
  const reference = flatten(ru as unknown as Tree);
  const target = flatten(locale as unknown as Tree);

  it('has no empty strings', () => {
    for (const [path, template] of target) {
      expect(template.trim(), path).not.toBe('');
    }
  });

  it('keeps the same placeholders per key', () => {
    for (const [path, template] of reference) {
      // Plural forms may differ per locale — compare only the shared ones.
      const other = target.get(path);
      if (other === undefined) continue;
      expect(placeholders(other), path).toEqual(placeholders(template));
    }
  });

  it('covers every non-plural key of the reference', () => {
    for (const path of reference.keys()) {
      if (path.includes('#')) continue;
      expect(target.has(path), path).toBe(true);
    }
  });
});
