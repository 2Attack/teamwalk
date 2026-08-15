import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Юнит-тесты запускаются в Node без окружения браузера: проверяем чистую логику
 * (постфильтр хинтов, серии), а не React-компоненты.
 */
export default defineConfig({
  resolve: {
    // Тот же алиас, что в tsconfig.json — иначе импорты `@/lib/...` не резолвятся.
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /*
     * The suites assert Russian content (validation messages, telegram texts,
     * the ru hint filter), so the locale is pinned explicitly instead of
     * relying on the app default (en). Locale-specific tests override it via
     * `vi.stubEnv` + `vi.resetModules`.
     */
    env: { NEXT_PUBLIC_LOCALE: 'ru' },
  },
});
