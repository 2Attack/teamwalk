/**
 * PIN access gate primitives (spec 003-pin-access-gate).
 *
 * Stateless by design: the unlock proof is an HMAC of a constant message keyed
 * by `ACCESS_PIN`, so verification is a pure function of (cookie, env) and
 * rotating the PIN invalidates every issued cookie at once. Web Crypto only —
 * the module runs both in `proxy.ts` and in nodejs Route Handlers.
 */

export const ACCESS_COOKIE_NAME = 'tw_access';

/** ~1 year; devices re-prompt on expiry or PIN rotation, whichever first. */
export const ACCESS_COOKIE_MAX_AGE_S = 31_536_000;

/** Versioned HMAC message: bump the suffix to force a global re-login. */
const TOKEN_MESSAGE = 'teamwalk-access-v1';

const encoder = new TextEncoder();

/** Gate is on only when ACCESS_PIN is non-empty after trim. */
export function isGateEnabled(): boolean {
  return (process.env.ACCESS_PIN ?? '').trim().length > 0;
}

/** hex(HMAC-SHA256(key = pin, message = TOKEN_MESSAGE)) — 64 hex chars. */
export async function computeAccessToken(pin: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(TOKEN_MESSAGE));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Length-safe constant-time string comparison. XOR-fold instead of
 * `timingSafeEqual`: `node:crypto` is not guaranteed in the proxy bundle.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  // Iterate over one buffer's full length; fold the length delta into the result.
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < bytesA.length; i += 1) {
    diff |= bytesA[i]! ^ (bytesB[i % (bytesB.length || 1)] ?? 0);
  }
  return diff === 0;
}

/** True when the cookie value is the token derived from the current PIN. */
export async function verifyAccessToken(
  cookieValue: string | undefined,
  pin: string,
): Promise<boolean> {
  if (!cookieValue) return false;
  return constantTimeEqual(cookieValue, await computeAccessToken(pin));
}

/**
 * Open-redirect guard for the `next` query param: only same-origin relative
 * paths pass (`/...` but not `//host` or `/\host`); anything else becomes `/`.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/')) return '/';
  const second = raw.charAt(1);
  if (second === '/' || second === '\\') return '/';
  return raw;
}
