import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HintSnapshot } from '@/lib/hints/snapshot';

/**
 * Провайдер хинтов — Vercel AI Gateway через AI SDK (п. 8): Gateway → null.
 * Мокируется сам `generateObject`: транспорт и валидация схемы — зона AI SDK,
 * наша зона — деградация (`null` = «пул не обновляем», никаких исключений).
 *
 * `GATEWAY_MODEL` читается на импорте модуля, поэтому каждый тест импортирует
 * модуль заново через `vi.resetModules()` после стаба env.
 */

vi.mock('ai', () => ({ generateObject: vi.fn() }));

const SNAPSHOT: HintSnapshot = {
  team_total_km: 42,
  team_km_week: 6,
  route_position: { passed: 'Ярославль', next: 'Ростов', km_left: 11 },
  next_milestone: { at: 100, left: 58 },
  participants: [
    {
      slot: 'u1',
      rank: 1,
      total_km: 42,
      walks: 7,
      days_since_last: 0,
      usual_speed: 4.5,
      km_week: 6,
    },
  ],
};

const HINT = { text: '{{u1}} — 42 км. Дорожка просит перерыв.', tone: 'praise', subject: 'u1' };

async function load() {
  vi.resetModules();
  // Последовательно, не Promise.all: конкурентный импорт после resetModules
  // даёт модулям разные инстансы мока 'ai'.
  const { generateObject } = await import('ai');
  const { requestHints } = await import('@/lib/hints/providers');
  return { requestHints, generateObject: vi.mocked(generateObject) };
}

describe('requestHints: Gateway через AI SDK', () => {
  beforeEach(() => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw-key');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('успешный ответ → результат с провайдером gateway', async () => {
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.provider).toBe('gateway');
    expect(result?.hints).toEqual([HINT]);
    const options = generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.model).toBe('xai/grok-4.1-fast-non-reasoning');
    expect(options.output).toBe('array');
  });

  it('AI_GATEWAY_MODEL переопределяет модель', async () => {
    vi.stubEnv('AI_GATEWAY_MODEL', 'zai/glm-4.6v-flash');
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.model).toBe('zai/glm-4.6v-flash');
  });

  it('без кредов LLM не вызывается вовсе', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const { requestHints, generateObject } = await load();

    await expect(requestHints(SNAPSHOT)).resolves.toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('VERCEL_OIDC_TOKEN достаточно вместо API-ключа', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token');
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.provider).toBe('gateway');
  });

  it('на Vercel пробуем и без env-кредов: OIDC-токен приходит заголовком в рантайме', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL', '1');
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.provider).toBe('gateway');
  });

  it('ошибка Gateway → null, а не исключение', async () => {
    const { requestHints, generateObject } = await load();
    generateObject.mockRejectedValueOnce(new Error('HTTP 429'));

    await expect(requestHints(SNAPSHOT)).resolves.toBeNull();
  });

  it('пустой массив от модели → null: пустой пул не пишем (п. 6.6.5)', async () => {
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [] } as never);

    await expect(requestHints(SNAPSHOT)).resolves.toBeNull();
  });
});
