import { describe, expect, it } from 'vitest';

import { createTreadmillSchema, patchTreadmillSchema } from '@/lib/validation';

/**
 * Validation rules for treadmill CRUD: shared by the settings
 * UI and the API route handlers, so they are tested once here.
 */

describe('createTreadmillSchema', () => {
  it('accepts a valid treadmill and normalizes the name', () => {
    const parsed = createTreadmillSchema.parse({
      name: '  У   окна ',
      maxSpeedKmh: 10,
    });
    expect(parsed.name).toBe('У окна');
    expect(parsed.maxSpeedKmh).toBe(10);
    expect(parsed.sortOrder).toBeUndefined();
  });

  it('accepts an explicit sort order', () => {
    const parsed = createTreadmillSchema.parse({
      name: 'У кухни',
      maxSpeedKmh: 6,
      sortOrder: 5,
    });
    expect(parsed.sortOrder).toBe(5);
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(
      createTreadmillSchema.safeParse({ name: 'A', maxSpeedKmh: 10 }).success,
    ).toBe(false);
  });

  it('rejects disallowed characters in the name', () => {
    expect(
      createTreadmillSchema.safeParse({ name: 'Окно<script>', maxSpeedKmh: 10 }).success,
    ).toBe(false);
  });

  it.each([0, 26, 4.5, -1])('rejects max speed %s', (maxSpeedKmh) => {
    expect(createTreadmillSchema.safeParse({ name: 'У окна', maxSpeedKmh }).success).toBe(false);
  });

  it.each([1, 25])('accepts boundary max speed %s', (maxSpeedKmh) => {
    expect(createTreadmillSchema.safeParse({ name: 'У окна', maxSpeedKmh }).success).toBe(true);
  });

  it.each([-1, 1000, 1.5])('rejects sort order %s', (sortOrder) => {
    expect(
      createTreadmillSchema.safeParse({ name: 'У окна', maxSpeedKmh: 10, sortOrder }).success,
    ).toBe(false);
  });

  it('rejects a missing max speed', () => {
    expect(createTreadmillSchema.safeParse({ name: 'У окна' }).success).toBe(false);
  });
});

describe('patchTreadmillSchema', () => {
  it('accepts a partial update', () => {
    const parsed = patchTreadmillSchema.parse({ maxSpeedKmh: 8 });
    expect(parsed.maxSpeedKmh).toBe(8);
  });

  it('accepts toggling isActive alone', () => {
    expect(patchTreadmillSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(patchTreadmillSchema.safeParse({}).success).toBe(false);
  });

  it('applies the same bounds as create', () => {
    expect(patchTreadmillSchema.safeParse({ maxSpeedKmh: 26 }).success).toBe(false);
    expect(patchTreadmillSchema.safeParse({ sortOrder: 1000 }).success).toBe(false);
    expect(patchTreadmillSchema.safeParse({ name: 'X' }).success).toBe(false);
  });
});
