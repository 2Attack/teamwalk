# Implementation Plan: Walk Screen Back Button, No Home Auto-Redirect, Rich Active-Walk Cards

**Branch**: `002-walk-page-back` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-walk-page-back/spec.md`

## Summary

Three coupled UX changes, client-only, no DB/API/DTO work:

1. Remove the passive auto-redirect from home to the walk screen (`app/page.tsx:64-66`); home stays reachable while a walk runs.
2. Replace the plain-text "who is on the treadmill" blockers with a new `WalkInProgressCard` component (avatar, name, live duration, speed, tap-through to `/walk/[id]`), used both as the selected participant's resume card and as busy-treadmill cards.
3. Add a back button at the top of the walk screen navigating home without touching walk state.

Amend `TeamWalk_TZ.md` § 6.3 (auto-redirect clause) and the § 6.1 landing note in the same PR — the current behavior is spec-mandated, so the product spec evolves with the feature (constitution Principle I). All design decisions are recorded in [research.md](./research.md) (D1–D7).

## Technical Context

**Language/Version**: TypeScript strict, React 19, Next.js App Router (Next 16, `params` as `Promise`)

**Primary Dependencies**: SWR (existing hooks in `lib/client/api.ts`), 8bitcn/shadcn UI (`components/ui/8bit/*`), `lib/i18n` (en/ru/es), pixelarticons via `scripts/gen-icons.mjs`

**Storage**: N/A — no schema, query or API changes; `ActiveWalkDto` and `TreadmillBusyDto` already carry everything (incl. `TreadmillBusyDto.walkId`)

**Testing**: vitest (`tests/*.test.ts`, pure TS, run pinned to `ru` locale); `npm run typecheck` is the primary gate

**Target Platform**: Web (shared office tablet + phones), dark theme only

**Project Type**: Next.js web app, client components only for this feature

**Performance Goals**: 1 s duration tick only while a relevant walk is active (existing `useNowTick` discipline); no new network requests beyond already-subscribed SWR keys

**Constraints**: touch targets ≥ 44 px; palette tokens only; zero border radius; animate only `transform`/`opacity`; icons only via `@/components/ui/icon` (add `arrowLeft` through the generator, commit the regenerated file)

**Scale/Scope**: 2 pages touched (`app/page.tsx`, `app/walk/[id]/page.tsx`), 1 component reworked (`StartWalkCard.tsx`), 1 new component, 3 dictionaries, 1 icon-map line, TZ amendment, 1 new test file

## Constitution Check

*GATE: evaluated against TeamWalk Constitution v1.0.0 — PASS (one documented spec amendment, see below). Re-checked after Phase 1 design — still PASS.*

| Principle | Status | Notes |
|---|---|---|
| I. Spec Is the Source of Truth | ⚠ PASS with amendment | The feature intentionally removes the § 6.3 auto-redirect. Resolution: amend `TeamWalk_TZ.md` § 6.3 + § 6.1 landing note in the same PR (research D6, spec FR-006). Extension is explicit, not a silent contradiction. |
| II. Stateless Server, DB Owns State | PASS | No server changes. Timer stays derived from `walks.started_at`; leaving/re-entering the walk screen loses nothing — that is what makes the back button safe. |
| III. Typed Contracts at Every Boundary | PASS | No DTO/API changes. Card props are a mapped subset of existing DTOs; client keeps using existing SWR hooks (`useActiveWalk`, `useTreadmills`). |
| IV. Localization Is Structural | PASS | New keys (`walk.backHome`, `walkCard.*`) added to ru (reference) + en + es; retired keys (`blockerSingleBusy`, `blockerAllBusyTail`) removed from all three; `Messages` type enforces parity; ru-pinned tests updated. |
| V. LLM Off the Hot Path | PASS | Not touched. |
| VI. Time Through One Module | PASS | No date math added; durations use existing `elapsedSec` (clamped) + `formatDuration`. |
| VII. Pixel UI System Discipline | PASS | New card built from 8bit `Card`/`Button` + `Avatar` + `Icon`; `font="normal"` for names/durations (data), pixel `retro` only for the card title/action label; new icon added via `npm run gen:icons`, generated file committed; ≥ 44 px targets; token colors only. |

**Development Workflow gates**: feature branch `002-walk-page-back` (not `main`) ✓; no manual migrations (none exist) ✓; `typecheck` + `vitest` before merge ✓; Spec Kit artifacts under `specs/002-walk-page-back/` ✓.

## Project Structure

### Documentation (this feature)

```text
specs/002-walk-page-back/
├── spec.md              # Feature spec (written here — /speckit-specify was skipped)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1–D7
├── data-model.md        # Phase 1 — reused DTOs + card prop model
├── quickstart.md        # Phase 1 — validation scenarios
├── contracts/
│   └── ui-contract.md   # Phase 1 — UI/navigation contract (no API changes)
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
app/
├── page.tsx                     # remove passive redirect effect; pass activeWalk down; keep startFlowActive pause (D1, D2)
└── walk/[id]/page.tsx           # back button row at top (D5)

components/
├── WalkInProgressCard.tsx       # NEW — shared resume/busy card (D3)
├── StartWalkCard.tsx            # render resume card when activeWalk; startBlocker → structured result rendered as busy cards (D2, D4)
└── TreadmillPicker.tsx          # unchanged UI; elapsedSec/useNowTick stay exported (or move to a small shared module if imports get awkward)

lib/i18n/messages/
├── ru.ts                        # reference: + walk.backHome, + walkCard.*; − blockerSingleBusy, − blockerAllBusyTail
├── en.ts                        # same key set (Messages type enforces)
└── es.ts                        # same key set

scripts/gen-icons.mjs            # + arrowLeft: 'arrow-left' → npm run gen:icons
lib/icons.generated.ts           # regenerated, committed (never hand-edited)

tests/
└── start-blocker.test.ts        # NEW — unit tests for the structured startBlocker (ru strings)

TeamWalk_TZ.md                   # § 6.3 amendment + § 6.1 landing-note update (D6)
docs/CONTRACT.md                 # register WalkInProgressCard exports if the doc lists component zones
```

**Structure Decision**: Existing Next.js App Router layout; one new component file, everything else edits in place. No new directories.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle I amendment: § 6.3 auto-redirect removed from the TZ | User explicitly requests home to stay reachable during a walk; redirect blocks US2/US3 entirely | Keeping redirect + back button is self-defeating: home would instantly bounce back to the walk screen |
