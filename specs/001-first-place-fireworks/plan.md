# Implementation Plan: First-Place Fireworks

**Branch**: `feature/first-place-fireworks` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-first-place-fireworks/spec.md`

## Summary

When the first-place participant shown on the home-screen podium changes, every open screen
plays a short pixel-style fireworks burst over the page. Implementation is fully client-side:
a pure leader-transition detector fed by the existing leaderboard SWR stream, plus a
self-contained canvas overlay component that mounts only for the ~5 s of the effect and
unmounts leaving zero residual work. No new dependencies, no API or schema changes.

## Technical Context

**Language/Version**: TypeScript strict, React 19, Next.js App Router (client component)

**Primary Dependencies**: none added. Canvas 2D is hand-rolled; `motion/react` is already
present but not needed for this effect. `useReducedMotion` comes from `motion/react`
(already used by `AchievementToast`).

**Storage**: N/A — the "displayed leader" exists only in client component state (spec Key
Entities; constitution: streaks/records/derived state are never stored).

**Testing**: vitest (`tests/*.test.ts`, node env) for the pure transition detector;
manual scenario validation per [quickstart.md](./quickstart.md).

**Target Platform**: modern Chromium/WebKit; primary device is a low-powered office tablet
that keeps the page open for tens of minutes.

**Project Type**: web app (Next.js App Router) — single project, feature lives in
`components/` + `lib/client/`.

**Performance Goals**: no work at all until a burst fires (SC-005); during the burst,
one `requestAnimationFrame` loop drawing ≤ ~120 square particles; loop self-terminates
≤ 6 s (SC-002) and the canvas unmounts (FR-006).

**Constraints**: pointer-events: none, no layout shift (FR-002); no sound (FR-007);
suppressed under `prefers-reduced-motion` (FR-005); no heavyweight effect libraries
(spec Assumptions / TZ § 6.8 bundle constraint); pixel aesthetic on existing palette
tokens (FR-008).

**Scale/Scope**: 1 new component, 1 new pure module + unit tests, 1 wiring change in
`components/Podium.tsx`. No i18n changes (the effect renders no text).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Spec is source of truth | Feature is TZ § 6.8 "Layer 3" (canvas, backlog item "Салют при смене лидера"); no invented mechanics | PASS |
| II. Stateless server, DB owns state | No server/DB involvement; "displayed leader" is ephemeral client state, never stored | PASS |
| III. Typed contracts | No new endpoints or DTOs; consumes existing `LeaderboardDto` via `useLeaderboard` | PASS |
| IV. Localization | No user-facing strings added; canvas is decorative and `aria-hidden` | PASS |
| V. LLM off hot path | N/A — no LLM involvement | PASS |
| VI. Time through `lib/time.ts` | No calendar/date logic; effect timing uses monotonic frame timestamps, not dates | PASS |
| VII. Pixel UI discipline | Canvas is the TZ-sanctioned exception (isolated, absolute, pointer-events none); colors read from `app/globals.css` tokens; no lucide, no new UI kit parts | PASS |
| Workflow: quality gates | `npm run typecheck` + `npm test` must pass; unit tests added for the detector | PASS (planned) |

Post-design re-check (after Phase 1): no violations introduced — see
[research.md](./research.md) decisions D1–D6; Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-first-place-fireworks/
├── spec.md              # /speckit-specify output
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (no API changes — statement only)
│   └── README.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
lib/
└── client/
    └── leader-transition.ts   # NEW: pure detector — (prevState, periodKey, leaderId) → {fire, nextState}

components/
├── FireworksOverlay.tsx       # NEW: self-contained canvas burst; mounts only while playing
└── Podium.tsx                 # EDIT: feed detector from useLeaderboard rows; render overlay on fire

tests/
└── leader-transition.test.ts  # NEW: unit tests for the detector (vitest, node env)
```

**Structure Decision**: single-project web app layout already used by the repo. Detection
logic goes to `lib/client/` (client-only concern, mirrors `lib/client/api.ts` placement);
the overlay is a standalone component per TZ § 6.8 ("isolated component inside the DOM
page, never a replacement for markup"). `Podium.tsx` is the only integration point because
it already owns the leaderboard rows for the currently selected period.

## Complexity Tracking

No constitution violations — table intentionally empty.
