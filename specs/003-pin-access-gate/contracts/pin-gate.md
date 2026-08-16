# Contracts: PIN Access Gate

**Feature**: 003-pin-access-gate | **Date**: 2026-08-17

Three surfaces: the request gate (proxy), the unlock endpoint, and the unlock page. Cookie shape is defined in [data-model.md](../data-model.md).

## 1. Request gate — `proxy.ts`

Runs on every request except the exempt matcher list. Pure cookie check, zero I/O.

| Condition | Page request (`Accept`/path is a page) | API request (path starts with `/api/`) |
|-----------|----------------------------------------|----------------------------------------|
| Gate off (`ACCESS_PIN` absent/empty) | pass through unchanged | pass through unchanged |
| Valid `tw_access` cookie | pass through unchanged | pass through unchanged |
| Missing/invalid cookie | `307` redirect → `/pin?next=<pathname+search>` | `401` JSON envelope (below) |

401 envelope (matches `ApiErrorBody` from `lib/api.ts` exactly):

```json
{ "error": { "code": "PIN_REQUIRED", "message": "<localized m.pin.required>" } }
```

**Exempt paths** (proxy never runs): `_next/static/*`, `_next/image/*`, `favicon.ico`, `icon.svg`, `apple-icon.png`, `manifest.webmanifest`, `/api/cron/*`, `/api/telegram/*`, `/pin`, `/api/pin`.

Invariants:

- The proxy never reads the request body and never touches the DB.
- The proxy never emits the PIN or the expected cookie value in any response.
- Distinguishing page vs API: `pathname.startsWith('/api/')`.

## 2. Unlock endpoint — `POST /api/pin`

Route Handler, `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, wrapped in `handle`.

### Request

```json
{ "pin": "string (1..128 after trim)" }
```

Validated by `pinVerifySchema` (`lib/validation.ts`).

### Responses

| Case | Status | Body | Side effect |
|------|--------|------|-------------|
| Gate off | `404` | `{ "error": { "code": "NOT_FOUND", "message": … } }` | none — endpoint "does not exist" when disabled |
| Correct PIN (constant-time compare vs `ACCESS_PIN`) | `200` | `{ "ok": true }` (`PinVerifyResponseDto`) | `Set-Cookie: tw_access=<HMAC>; HttpOnly; Path=/; SameSite=Lax; Max-Age=31536000[; Secure]` |
| Wrong PIN | `401` | `{ "error": { "code": "PIN_INVALID", "message": "<m.pin.wrongPin>" } }` | none |
| Malformed body / empty pin | `401` | same `PIN_INVALID` envelope as wrong PIN — deliberately indistinguishable (FR-007) | none |

Note: empty/oversized input intentionally does **not** return `VALIDATION_ERROR` with field details — that would leak format hints. Schema failure maps to the same generic `PIN_INVALID`.

## 3. Unlock page — `GET /pin`

Server component; exempt from the proxy.

| Condition | Behavior |
|-----------|----------|
| Gate off | redirect `/` |
| Valid `tw_access` cookie already present | redirect `/` |
| Otherwise | render the PIN form (8bit Card + Label + password Input + Button; heading in pixel `retro`, prompt text `font="normal"`; all strings from `m.pin.*`) |

Client form behavior (`components/pin/PinGateForm.tsx`):

- Submits via `apiSend('POST', '/api/pin', { pin })`.
- On `200`: `window.location.assign(sanitizeNextPath(searchParams.next))` — full navigation so the httpOnly cookie applies everywhere; sanitizer falls back to `/`.
- On `ApiError` with `PIN_INVALID`: show `m.pin.wrongPin` inline, keep focus in the field, allow retry.
- Touch target ≥ 44 px; no autofocus-stealing on mobile keyboards beyond the single field.

## 4. Client parser addition — `lib/client/api.ts`

`parse()` gains one branch **before** throwing `ApiError`:

```text
if (status === 401 && envelope.error.code === 'PIN_REQUIRED' && in browser)
    → window.location.assign('/pin?next=' + encodeURIComponent(location.pathname + location.search))
    → return a never-resolving promise (navigation is in flight)
```

This covers cookie expiry / PIN rotation while the SPA is open: the next SWR poll or mutation lands on the unlock screen instead of an error toast loop.

## 5. Shared logic module — `lib/access/pin.ts` (internal contract)

| Export | Signature | Notes |
|--------|-----------|-------|
| `ACCESS_COOKIE_NAME` | `'tw_access'` | |
| `ACCESS_COOKIE_MAX_AGE_S` | `31_536_000` | ~1 year |
| `isGateEnabled` | `() => boolean` | `ACCESS_PIN` non-empty after trim |
| `computeAccessToken` | `(pin: string) => Promise<string>` | Web Crypto HMAC-SHA256, hex; deterministic |
| `verifyAccessToken` | `(cookieValue: string \| undefined, pin: string) => Promise<boolean>` | constant-time |
| `constantTimeEqual` | `(a: string, b: string) => boolean` | XOR-fold, length-safe |
| `sanitizeNextPath` | `(raw: string \| null \| undefined) => string` | relative-path whitelist, fallback `/` |

Everything here is a pure function of its inputs (plus `process.env.ACCESS_PIN` in `isGateEnabled`) — the vitest surface for the feature.
