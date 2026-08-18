# Implementation Plan: Treadmill Busy Telegram Notification

**Branch**: `feature/004-treadmill-busy-notify` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-treadmill-busy-notify/spec.md`

## Summary

Add the mirror of the existing "treadmill freed up" Telegram broadcast: when a starting walk occupies the **last free** active treadmill (transition "≥1 free → 0 free"), send one message to all availability subscribers (`notify_free` toggle) saying no treadmills are free. Reuse every existing mechanism: `notification_log` dedup, the `FREE_WINDOW` delivery hours, the recipient filter (skip the trigger user, active walkers, muted users), the per-locale `TelegramTexts` variant system, and `waitUntil()` background dispatch from the walk-start route. No schema changes, no new API surface, no new settings toggle.

## Technical Context

**Language/Version**: TypeScript (strict), Next.js App Router, Node.js runtime on Vercel

**Primary Dependencies**: Drizzle ORM + Neon Postgres (HTTP driver), `@vercel/functions` (`waitUntil`), Telegram Bot API via `lib/telegram/client.ts`

**Storage**: Existing tables only — `walks`, `treadmills`, `telegram_links`, `notification_log` (new `kind` value `'busy'`, no migration: `kind` is a plain text column)

**Testing**: vitest (`tests/*.test.ts`, locale pinned to `ru`); primary gate `npm run typecheck`

**Target Platform**: Vercel serverless (prod + previews); Telegram bot active only in production

**Project Type**: Web service (Next.js Route Handlers + background notification module)

**Performance Goals**: Zero added latency on `POST /api/walks/start` — all new work runs after the response via `waitUntil()`

**Constraints**: Never throw from notification code; at most one broadcast per all-busy transition under concurrent starts; event expires instantly outside the delivery window

**Scale/Scope**: A handful of treadmills, tens of subscribers; one new notify function, one new text builder, three locale additions, route wiring, tests

## Constitution Check

*GATE: evaluated against Constitution v1.1.0 — all pass, no violations to justify.*

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec is source of truth | PASS | Explicit extension of the freed-up broadcast (spec 004); no invented mechanics. |
| II. Stateless server, DB owns state | PASS | All-busy state computed from `walks` on the fly; idempotency via existing `notification_log` unique index; no in-memory state. |
| III. Typed contracts at every boundary | PASS | No new endpoints, DTOs, or validation schemas; internal function typed in `lib/telegram/notify.ts`. |
| IV. Localization is structural | PASS | New variants added to the `TelegramTexts` interface — the type forces en/ru/es parity; no hardcoded user-facing text. |
| V. LLM off the hot path | PASS | No LLM involvement. |
| VI. Time through one module | PASS | Delivery window reuses `isWeekend`/`toOfficeDay`/`officeHour` from `lib/time.ts`, exactly as `notifyTreadmillFreed` does. |
| VII. Pixel UI discipline | PASS | No UI changes. |
| Platform constraints | PASS | No per-user auth introduced; Telegram stays env-gated (`telegramEnabled()`); previews unaffected. |
| Workflow | PASS | Feature branch `feature/004-treadmill-busy-notify`; gates: `npm run typecheck` + `npm test`. |

**Post-design re-check (Phase 1)**: unchanged — the design adds no schema, no endpoints, no UI; all logic lives in the existing notification module following its established idioms. PASS.

## Project Structure

### Documentation (this feature)

```text
specs/004-treadmill-busy-notify/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: design decisions
├── data-model.md        # Phase 1: entities & log usage
├── quickstart.md        # Phase 1: validation guide
├── contracts/
│   └── busy-notification.md   # Phase 1: message + function contract
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
lib/telegram/
├── notify.ts            # + notifyAllTreadmillsBusy(); wereAllTreadmillsBusy() reused post-insert
├── texts.ts             # + allBusyText() builder
└── texts/
    ├── types.ts         # + allBusyVariants on TelegramTexts
    ├── ru.ts            # + 3 variants (reference locale)
    ├── en.ts            # + 3 variants
    └── es.ts            # + 3 variants

app/api/walks/start/route.ts   # + waitUntil(notifyAllTreadmillsBusy(...)) after successful insert

tests/
└── telegram.texts.test.ts     # + allBusyText coverage (ru-pinned assertions)
```

**Structure Decision**: everything stays inside the existing `lib/telegram` notification module and the walk-start route — the same files that implement the freed-up mirror event. No new directories or layers.

## Complexity Tracking

No constitution violations — table intentionally empty.
