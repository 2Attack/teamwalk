# Implementation Plan: PIN Access Gate

**Branch**: `003-pin-access-gate` | **Date**: 2026-08-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-pin-access-gate/spec.md`

## Summary

Add an opt-in, deployment-wide access gate driven by a single server-only env variable `ACCESS_PIN`. When set, a root `proxy.ts` (Next 16 middleware convention) checks an HMAC-derived, httpOnly unlock cookie on every page and API request: browsers without it are redirected to a pixel-styled `/pin` screen, API calls are rejected with a typed 401. The cookie value is derived from the PIN itself (HMAC-SHA256 via Web Crypto), so it is stateless (no DB, no sessions), unforgeable without the PIN, and rotating the PIN invalidates every device at once. Cron and Telegram endpoints keep their existing dedicated secrets and stay exempt.

## Technical Context

**Language/Version**: TypeScript strict, Next.js 16.3.0 (App Router), React 19.2.8, Node.js 24 on Vercel

**Primary Dependencies**: Zod 4 (input validation), SWR 2 (client data), existing `lib/api.ts` error envelope, `lib/i18n` dictionaries, 8bitcn UI kit (`components/ui/8bit/*`). No new packages.

**Storage**: none — the gate is deliberately stateless. No DB tables, no migrations; the unlock proof lives in an httpOnly cookie derived from `ACCESS_PIN`.

**Testing**: vitest (`tests/*.test.ts`, locale pinned to `ru`); pure logic extracted to `lib/access/` so it is unit-testable without HTTP mocks. `npm run typecheck` is the primary gate.

**Target Platform**: Vercel (production + preview deploys), local `npm run dev`

**Project Type**: web application (single Next.js project, existing layout)

**Performance Goals**: proxy overhead ≤ 1 ms per request — one in-memory HMAC + constant-time compare, zero I/O (per Next.js auth guidance: optimistic cookie checks only, never DB in proxy)

**Constraints**: no process-memory state (serverless); no new user-facing strings outside `lib/i18n`; `ACCESS_PIN` must never reach the client bundle (server-only env, not `NEXT_PUBLIC_*`); gate absent ⇒ zero behavior change

**Scale/Scope**: one shared PIN, ~10 team members, every route of one deployment; ~8 touched/new files + 3 dictionaries

## Constitution Check

*GATE: evaluated against constitution v1.0.0 before Phase 0; re-checked after Phase 1 design.*

| Principle | Verdict | Notes |
|-----------|---------|-------|
| I. Spec is the source of truth | PASS | Perimeter feature; touches no game mechanics from `TeamWalk_TZ.md`. Feature spec extends the product explicitly via `specs/003`. |
| II. Stateless server, DB owns state | PASS | No sessions, no tables. Unlock proof = deterministic HMAC of `ACCESS_PIN`; verification is a pure function of (cookie, env). |
| III. Typed contracts at every boundary | PASS | New `ApiErrorCode`s (`PIN_REQUIRED`, `PIN_INVALID`), `PinVerifyResponseDto` in `lib/types.ts`, Zod schema in `lib/validation.ts`, errors via `apiError`/`handle`. |
| IV. Localization is structural | PASS | New `pin.*` keys added to all three dictionaries; `Messages` type enforces parity. |
| V. LLM off the hot path | PASS | Not involved. |
| VI. Time through one module | PASS | No date math; cookie lifetime is a duration constant (`ACCESS_COOKIE_MAX_AGE_S`), not a computed date. |
| VII. Pixel UI system discipline | PASS | `/pin` screen built from `components/ui/8bit` Card/Input/Button/Label, palette tokens only, `font="normal"` for prompt text, `retro` for the heading/button. |
| Platform Constraints: "no authorization by design — feature specs MUST NOT introduce auth flows" | **VIOLATION — justified** | Explicit product-owner request; see Complexity Tracking. Constitution amendment ships in the same PR. |

**Post-Phase-1 re-check**: design unchanged the verdicts — still stateless, still typed, still localized. The single violation remains the deliberate trust-model extension, resolved by amending the constitution (see below).

## Project Structure

### Documentation (this feature)

```text
specs/003-pin-access-gate/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── pin-gate.md      # Phase 1 output: proxy behavior + /api/pin contract + cookie contract
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
proxy.ts                          # NEW — Next 16 request gate: cookie check, redirect/401, exemption matcher
app/
├── pin/
│   └── page.tsx                  # NEW — server component: redirects home if gate off/unlocked, else renders form
└── api/
    └── pin/
        └── route.ts              # NEW — POST: verify PIN, set unlock cookie (runtime nodejs, force-dynamic)
components/
└── pin/
    └── PinGateForm.tsx           # NEW — client form: 8bit Card/Input/Button, localized errors, next-redirect
lib/
├── access/
│   └── pin.ts                    # NEW — pure logic: token derivation (Web Crypto HMAC), constant-time verify,
│                                 #        cookie name/options constants, isGateEnabled(), sanitizeNextPath()
├── api.ts                        # EDIT — add 'PIN_REQUIRED' | 'PIN_INVALID' to ApiErrorCode
├── client/api.ts                 # EDIT — parse(): on 401 PIN_REQUIRED, hard-redirect to /pin?next=<path>
├── types.ts                      # EDIT — add PinVerifyResponseDto
├── validation.ts                 # EDIT — add pinVerifySchema
└── i18n/messages/{ru,en,es}.ts   # EDIT — add pin.* section (title, prompt, placeholder, submit, wrongPin)
tests/
└── access.pin.test.ts            # NEW — token determinism/rotation, verify, sanitizeNextPath, schema
.specify/memory/constitution.md   # EDIT — amend Platform Constraints trust model (MINOR bump → 1.1.0)
README.md (+ ru/es)               # EDIT — document ACCESS_PIN in the env table
```

**Structure Decision**: single existing Next.js project; the only new top-level file is `proxy.ts` (framework-mandated location). All gate logic that carries decisions lives in `lib/access/pin.ts` so both `proxy.ts` and the route handler share one implementation and vitest can test it as pure functions.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Introduces an auth-like flow despite "no authorization by design" (constitution v1.0.0, Platform Constraints) | Product owner explicitly requested a perimeter PIN so strangers who obtain the URL cannot read or corrupt team stats | "Keep the URL secret" is already the status quo and has failed as a guarantee (links leak); Vercel Deployment Protection on production would block the whole team behind Vercel SSO accounts — heavier than a shared PIN and against the "no accounts" model. The gate stays opt-in (env unset ⇒ app unchanged) and identity-free (one shared PIN, no users/roles), so the constitution is amended narrowly: "no per-user authorization; an optional deployment-wide access PIN is permitted" (MINOR bump to 1.1.0, same PR). |
