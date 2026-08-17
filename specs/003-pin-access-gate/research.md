# Research: PIN Access Gate

**Feature**: 003-pin-access-gate | **Date**: 2026-08-17

All Technical Context unknowns resolved. Decisions below.

## R1. Enforcement point: `proxy.ts` (Next 16 middleware convention)

- **Decision**: A root `proxy.ts` exporting `function proxy(request: NextRequest)` with a `config.matcher`, per the Next.js 16 file convention (verified against current Next.js docs — `middleware.ts` is the deprecated name, `proxy.ts` is the recommended one; the matcher schema is identical).
- **Rationale**: It is the only place that sees every page *and* API request before any handler runs, including prefetches and deep links. Next's own auth guidance endorses exactly this pattern: optimistic checks reading only cookies, no I/O. One file gates the whole deployment; no per-route wrappers to forget.
- **Alternatives considered**:
  - *Per-route guard helper called in every Route Handler + layout-level check for pages* — ~15 call sites today and every future route becomes a place to forget the guard; pages would still flash content. Rejected.
  - *`app/layout.tsx` server check only* — protects pages but not direct API calls, which is precisely the "corrupt the stats" vector. Rejected.
  - *Vercel Deployment Protection* — platform SSO per user, requires Vercel accounts for the whole team, cannot be styled, not available as a simple shared PIN on the Hobby plan. Rejected.

## R2. Unlock proof: stateless HMAC cookie derived from the PIN

- **Decision**: Cookie `tw_access` = hex(HMAC-SHA256(key = `ACCESS_PIN`, message = `'teamwalk-access-v1'`)), computed with Web Crypto (`crypto.subtle`), compared with a constant-time equality function. httpOnly, `secure` outside dev, `sameSite=lax`, `path=/`, `maxAge` = 1 year (`ACCESS_COOKIE_MAX_AGE_S = 31_536_000`).
- **Rationale**:
  - *Stateless* — verification is a pure function of (cookie value, env var); nothing stored anywhere, honoring constitution II on serverless.
  - *Unforgeable* — producing the value requires knowing the PIN; the cookie never contains the PIN itself.
  - *Rotation for free* — changing `ACCESS_PIN` changes the expected HMAC, so every previously issued cookie fails on the next request (spec FR-006) with no invalidation bookkeeping.
  - *Web Crypto, not `node:crypto`* — the same `lib/access/pin.ts` module runs in `proxy.ts` and in the Route Handler regardless of runtime; `crypto.subtle` is available in both (Node ≥ 18 global).
- **Alternatives considered**:
  - *Cookie = the PIN itself* — leaks the secret to every device's cookie jar; rotation-unfriendly. Rejected.
  - *Cookie = plain SHA-256(PIN)* — works, but an unkeyed hash of a low-entropy PIN is trivially brute-forceable offline if a cookie value ever leaks (logs, screenshots). HMAC with a versioned message is the same effort and strictly better. (Both are brute-forceable in principle for short PINs; HMAC at least binds the value to this app.)
  - *Server-side sessions in Postgres + random token* — real session management, DB write on unlock, cleanup concerns; overkill for a shared-PIN deterrent and adds DB I/O to the proxy hot path, which Next explicitly warns against. Rejected.
  - *Signed JWT with separate signing secret* — needs a second env secret to manage and rotate; no benefit over PIN-derived HMAC at this trust level. Rejected.

## R3. Timing safety

- **Decision**: PIN comparison in `POST /api/pin` and cookie comparison in the proxy both use a constant-time compare. In the nodejs route handler this is `timingSafeEqual` (same idiom as the existing cron/webhook guards); the shared `lib/access/pin.ts` exposes a portable XOR-fold `constantTimeEqual(a, b)` for the proxy since `node:crypto` availability there is a build detail we do not want to depend on.
- **Rationale**: matches the established codebase pattern (`app/api/cron/notify/route.ts`, `app/api/telegram/webhook/route.ts`); costless to do right.

## R4. Exemptions from the gate

- **Decision**: `config.matcher` excludes: `_next/static`, `_next/image`, `favicon.ico`, `icon.svg`, `apple-icon.png`, `manifest.webmanifest`, `/api/cron/*`, `/api/telegram/*`, `/pin`, `/api/pin`.
- **Rationale**:
  - Cron and the Telegram webhook already deny-by-default with their own constant-time secrets (`CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`) — verified in source. Machines cannot enter a PIN; double-gating would break production automation (spec FR-003 exemption, SC-005).
  - Static assets and the PWA manifest contain no team data; blocking them breaks icons on the PIN screen itself.
  - `/pin` and `/api/pin` are the unlock flow — gating them would deadlock.
- **Alternatives considered**: runtime `pathname.startsWith` checks inside `proxy()` instead of the matcher — works, but the matcher skips the proxy invocation entirely for exempt paths (cheaper) and documents the surface in one visible place. The proxy still re-checks nothing security-relevant is exempted beyond this list.

## R5. Open-redirect protection for the `next` parameter

- **Decision**: `sanitizeNextPath(raw)`: accept only strings that start with a single `/` (reject `//`, `/\`, anything with a scheme), fall back to `/`. Applied client-side before `window.location.assign` after a successful unlock.
- **Rationale**: `/pin?next=…` echoes attacker-controllable input into a navigation target; classic open-redirect. Whitelisting relative paths is the standard fix and testable as a pure function.

## R6. Client-side 401 handling (cookie expiry mid-session)

- **Decision**: `parse()` in `lib/client/api.ts` gets one addition: if the response is 401 with code `PIN_REQUIRED`, hard-navigate to `/pin?next=<current pathname>` instead of throwing into SWR retry loops.
- **Rationale**: SWR polls every 30 s; after a year-long cookie expires or a PIN rotation, every poll would surface raw errors. A single interception point (the only response parser in the app) converts that into the same unlock flow as a fresh visit. Guarded by `typeof window !== 'undefined'`.

## R7. Brute-force stance (v1)

- **Decision**: no lockout, no attempt throttling; only a generic localized error and the constant-time compare.
- **Rationale**: spec assumption — deterrent, not a security product; the deployment URL is non-guessable and previews sit behind Vercel Authentication. Any serverless-honest rate limit would need DB state (constitution II) for marginal benefit. Revisit only if abuse is observed.

## R8. Env var handling

- **Decision**: `ACCESS_PIN`, read via `process.env.ACCESS_PIN` inside `lib/access/pin.ts` (`isGateEnabled()` = non-empty after trim). Never `NEXT_PUBLIC_*`. Documented in the README env tables (en/ru/es). Optional everywhere: absent on previews/local ⇒ gate off, matching the "LLM credentials optional" precedent.
- **Rationale**: server-only by construction (Next only inlines `NEXT_PUBLIC_*` into the client bundle), satisfying FR-008; opt-in default satisfies SC-003.
