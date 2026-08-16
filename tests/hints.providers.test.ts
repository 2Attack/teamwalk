import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HintSnapshot } from '@/lib/hints/snapshot';

/**
 * Hint provider — Vercel AI Gateway via the AI SDK (spec § 8): Gateway → null.
 * `generateObject` itself is mocked: transport and schema validation belong to
 * the AI SDK; our part is degradation (`null` = "don't update the pool", never
 * an exception).
 *
 * `GATEWAY_MODEL` is read at module import, so every test re-imports the
 * module via `vi.resetModules()` after stubbing the env.
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
  // Sequential, not Promise.all: concurrent import after resetModules gives
  // the modules different instances of the 'ai' mock.
  const { generateObject } = await import('ai');
  const { requestHints } = await import('@/lib/hints/providers');
  return { requestHints, generateObject: vi.mocked(generateObject) };
}

describe('requestHints: Gateway via the AI SDK', () => {
  beforeEach(() => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'gw-key');
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    vi.stubEnv('VERCEL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('successful response → result with provider gateway', async () => {
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.provider).toBe('gateway');
    expect(result?.hints).toEqual([HINT]);
    const options = generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.model).toBe('xai/grok-4.1-fast-non-reasoning');
    expect(options.output).toBe('array');
  });

  it('AI_GATEWAY_MODEL overrides the model', async () => {
    vi.stubEnv('AI_GATEWAY_MODEL', 'zai/glm-4.6v-flash');
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.model).toBe('zai/glm-4.6v-flash');
  });

  it('without credentials the LLM is never called', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const { requestHints, generateObject } = await load();

    await expect(requestHints(SNAPSHOT)).resolves.toBeNull();
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('VERCEL_OIDC_TOKEN suffices instead of an API key', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token');
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.provider).toBe('gateway');
  });

  it('on Vercel we try even without env creds: the OIDC token arrives as a runtime header', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL', '1');
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [HINT] } as never);

    const result = await requestHints(SNAPSHOT);

    expect(result?.provider).toBe('gateway');
  });

  it('a Gateway error → null, not an exception', async () => {
    const { requestHints, generateObject } = await load();
    generateObject.mockRejectedValueOnce(new Error('HTTP 429'));

    await expect(requestHints(SNAPSHOT)).resolves.toBeNull();
  });

  it('an empty array from the model → null: never write an empty pool (spec § 6.6.5)', async () => {
    const { requestHints, generateObject } = await load();
    generateObject.mockResolvedValueOnce({ object: [] } as never);

    await expect(requestHints(SNAPSHOT)).resolves.toBeNull();
  });
});
