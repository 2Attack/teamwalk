# Data Model: PIN Access Gate

**Feature**: 003-pin-access-gate | **Date**: 2026-08-17

No database changes. The feature is deliberately stateless (constitution II): no tables, no migrations, no session storage. The two "entities" from the spec map to configuration and a derived cookie.

## Access PIN (configuration)

| Aspect | Value |
|--------|-------|
| Storage | Env variable `ACCESS_PIN` (server-only; never `NEXT_PUBLIC_*`) |
| Format | Free-form non-empty string after trim; no length/charset constraint imposed (operator's choice) |
| Enabled state | `isGateEnabled()` ⇔ `ACCESS_PIN` is set and non-empty after trim; empty/absent ⇒ gate fully off |
| Rotation | Redeploy (or env update + redeploy) with a new value; no code involved |

## Unlock grant (derived cookie)

| Aspect | Value |
|--------|-------|
| Name | `tw_access` |
| Value | `hex(HMAC-SHA256(key = ACCESS_PIN, message = "teamwalk-access-v1"))` — 64 hex chars |
| Attributes | `HttpOnly; Path=/; SameSite=Lax; Max-Age=31536000` (`ACCESS_COOKIE_MAX_AGE_S`, ~1 year); `Secure` outside local dev |
| Issued by | `POST /api/pin` on a correct PIN submission |
| Verified by | `proxy.ts` on every non-exempt request: recompute expected HMAC from env, constant-time compare with cookie value |
| Contains | No PIN, no user identity, no timestamp — a pure possession proof |

### Validation rules

- `POST /api/pin` body: `{ pin: string }`, Zod: non-empty after trim, max 128 chars (sanity bound only; failure message is the same generic "wrong PIN" — no format hints per FR-007).
- `next` query parameter on `/pin`: sanitized by `sanitizeNextPath` — must start with `/`, must not start with `//` or `/\`, no URL scheme; otherwise falls back to `/`.

### State transitions (per device/browser)

```text
            correct PIN via /api/pin
  LOCKED ────────────────────────────────▶ UNLOCKED (cookie set, ≤ 1 year)
    ▲                                          │
    │   cookie expires (Max-Age)               │
    ├──────────────────────────────────────────┤
    │   ACCESS_PIN rotated (HMAC mismatch)     │
    ├──────────────────────────────────────────┤
    │   cookie cleared by user                 │
    └──────────────────────────────────────────┘
```

Deployment-level state: `GATE OFF` (env absent/empty — every request passes, cookies irrelevant) ⇄ `GATE ON` (env set). Transitions happen only via deploys.

## Touched contracts in existing modules

- `ApiErrorCode` (`lib/api.ts`): + `PIN_REQUIRED` (401 from proxy on gated API calls), + `PIN_INVALID` (401 from `POST /api/pin` on a wrong/empty PIN).
- `lib/types.ts`: + `PinVerifyResponseDto = { ok: true }`.
- `lib/validation.ts`: + `pinVerifySchema`.
- `lib/i18n/messages/*`: + `pin` section (`title`, `prompt`, `placeholder`, `submit`, `wrongPin`) — full key parity across ru/en/es enforced by the `Messages` type.
