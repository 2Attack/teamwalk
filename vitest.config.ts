import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Unit tests run in Node without a browser environment: they cover pure logic
 * (hint post-filter, streaks), not React components.
 */
export default defineConfig({
  resolve: {
    // Same alias as in tsconfig.json — `@/lib/...` imports fail to resolve otherwise.
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
