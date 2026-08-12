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
  },
});
