import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_COOKIE_MAX_AGE_S,
  ACCESS_COOKIE_NAME,
  computeAccessToken,
  constantTimeEqual,
  isGateEnabled,
  sanitizeNextPath,
  verifyAccessToken,
} from '../lib/access/pin';

describe('computeAccessToken', () => {
  it('is deterministic for the same PIN', async () => {
    const a = await computeAccessToken('4321');
    const b = await computeAccessToken('4321');
    expect(a).toBe(b);
  });

  it('returns 64 lowercase hex chars (HMAC-SHA256)', async () => {
    const token = await computeAccessToken('4321');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs per PIN — rotation invalidates old tokens', async () => {
    const oldToken = await computeAccessToken('4321');
    const newToken = await computeAccessToken('9999');
    expect(oldToken).not.toBe(newToken);
  });
});

describe('verifyAccessToken', () => {
  it('accepts the matching token', async () => {
    const token = await computeAccessToken('4321');
    expect(await verifyAccessToken(token, '4321')).toBe(true);
  });

  it('rejects a token derived from another PIN', async () => {
    const token = await computeAccessToken('4321');
    expect(await verifyAccessToken(token, '9999')).toBe(false);
  });

  it('rejects undefined and empty cookie values', async () => {
    expect(await verifyAccessToken(undefined, '4321')).toBe(false);
    expect(await verifyAccessToken('', '4321')).toBe(false);
  });

  it('rejects a forged value of the right shape', async () => {
    expect(await verifyAccessToken('0'.repeat(64), '4321')).toBe(false);
  });
});

describe('constantTimeEqual', () => {
  it('accepts equal strings', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true);
    expect(constantTimeEqual('', '')).toBe(true);
  });

  it('rejects unequal strings of the same length', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false);
  });

  it('rejects strings of different length', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('abcd', 'abc')).toBe(false);
  });
});

describe('sanitizeNextPath', () => {
  it('accepts plain relative paths', () => {
    expect(sanitizeNextPath('/walk')).toBe('/walk');
    expect(sanitizeNextPath('/settings?tab=x')).toBe('/settings?tab=x');
  });

  it('rejects protocol-relative and backslash tricks', () => {
    expect(sanitizeNextPath('//evil.example')).toBe('/');
    expect(sanitizeNextPath('/\\evil.example')).toBe('/');
  });

  it('rejects absolute URLs with a scheme', () => {
    expect(sanitizeNextPath('https://evil.example')).toBe('/');
    expect(sanitizeNextPath('javascript:alert(1)')).toBe('/');
  });

  it('falls back to / for empty and missing values', () => {
    expect(sanitizeNextPath('')).toBe('/');
    expect(sanitizeNextPath(null)).toBe('/');
    expect(sanitizeNextPath(undefined)).toBe('/');
  });
});

describe('isGateEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when ACCESS_PIN is unset', () => {
    vi.stubEnv('ACCESS_PIN', undefined as unknown as string);
    expect(isGateEnabled()).toBe(false);
  });

  it('is disabled for empty and whitespace-only values', () => {
    vi.stubEnv('ACCESS_PIN', '');
    expect(isGateEnabled()).toBe(false);
    vi.stubEnv('ACCESS_PIN', '   ');
    expect(isGateEnabled()).toBe(false);
  });

  it('is enabled for a non-empty value', () => {
    vi.stubEnv('ACCESS_PIN', '4321');
    expect(isGateEnabled()).toBe(true);
  });
});

describe('cookie constants', () => {
  it('match the contract', () => {
    expect(ACCESS_COOKIE_NAME).toBe('tw_access');
    expect(ACCESS_COOKIE_MAX_AGE_S).toBe(31_536_000);
  });
});
