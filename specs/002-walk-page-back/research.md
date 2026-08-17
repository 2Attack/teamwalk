# Research: Walk Screen Back Button, No Home Auto-Redirect, Rich Active-Walk Cards

**Feature**: `002-walk-page-back` | **Date**: 2026-08-16

No NEEDS CLARIFICATION items remained after codebase inspection — the feature is
client-only and all data it needs already flows through existing DTOs. Decisions
below resolve the design choices the plan depends on.

## D1. How to remove the auto-redirect without breaking the start flow

**Decision**: Delete only the passive redirect effect in `app/page.tsx`
(`useEffect` at lines 64–66 reacting to `useActiveWalk`). Keep the
`useActiveWalk` subscription itself — it now powers the resume card. Keep the
`startFlowActive` pause (`onStartFlowChange`) as is.

**Rationale**: The start flow (`StartWalkCard.handleStart`) navigates by itself
(prime cache → prefetch → dwell → push); the home effect was a *second*
navigator that the `startFlowActive` flag existed to suppress. With the effect
gone, the flag's remaining job is UI stability: `primeActiveWalk` seeds the SWR
cache *before* navigation, and without the pause the home card would swap to
the resume card under the countdown overlay for a frame. Same mechanism, new
purpose — update the comments, not the wiring.

**Alternatives considered**:
- Remove `startFlowActive` entirely — rejected: causes a visible start-card →
  resume-card flash during the "GO!" dwell (~400 ms) when the seeded cache
  lands before `router.push` commits.
- Keep redirect but only on first load — rejected: still violates the core
  request (home must be reachable while walking).

## D2. Where the resume card lives and what happens to the start controls

**Decision**: The card replaces the treadmill/speed/start controls *inside*
`StartWalkCard`, below the always-visible `UserSelect`. One new component,
`WalkInProgressCard`, is rendered when `useActiveWalk(userId)` returns a walk.

**Rationale**: The shared-tablet flow requires participant switching to stay
reachable (switching to a participant without an active walk restores the
normal start controls). Starting is impossible anyway while a walk is active
(server 409 `WALK_ALREADY_ACTIVE`), so hiding the start button is honest UX,
not a limitation. Home already owns `userId` and passes it down — the card
needs no new state lifting; `StartWalkCard` receives the active walk (or
subscribes itself — plan puts the subscription in home, which already has it,
and passes `activeWalk` down as a prop to keep exactly one subscription).

**Alternatives considered**:
- A separate banner above the start card — rejected: two competing "start
  zones" on one screen; the disabled start button under a banner reads as a
  bug.
- Replacing the whole `StartWalkCard` — rejected: loses `UserSelect`, breaking
  the shared-tablet switch flow.

## D3. One card component for both "mine" and "someone else's" walk

**Decision**: A single `WalkInProgressCard` component with two data sources
mapped to one prop shape: `{ walkId, user: {name, avatarId}, startedAt,
speedKmh, treadmillName? }`. Variant prop distinguishes emphasis: `resume`
(primary action button, e.g. «Открыть прогулку») vs `busy` (whole card is the
tap target, secondary styling). Live duration via the existing `useNowTick` +
`elapsedSec` + `formatDuration` from `TreadmillPicker.tsx` / `lib/format.ts`.

**Rationale**: `TreadmillBusyDto` already carries `walkId`, `user.avatarId`,
`startedAt`, `speedKmh` — everything the card renders; `ActiveWalkDto` is a
superset. One component keeps the two contexts visually consistent (SC-003)
and avoids duplicated ticking logic.

**Alternatives considered**:
- Extending the API to return richer busy info — rejected: nothing missing.
- Two separate components — rejected: same layout, double maintenance.

## D4. Busy blockers → busy cards

**Decision**: `startBlocker()` in `StartWalkCard.tsx` currently returns a
string; it becomes structured: the "single treadmill busy" and "all busy"
cases return busy-walk data rendered as `WalkInProgressCard`s (one per busy
walk, ordered by longest-walking first), while "choose a free treadmill"
remains a text hint. `blockerSingleBusy`, `blockerAllBusyTail` and
`treadmillPicker.busyLabel`'s home usage are retired where replaced; the
`TreadmillPicker` in-button busy label (multi-treadmill grid) stays as is —
it lives inside a radio button where a nested card cannot go.

**Rationale**: The user's request targets the blocker text under the start
button. The picker's per-button busy line is a different, already-compact
affordance; changing it is out of scope and would bloat the radio buttons.

**Alternatives considered**:
- Making picker buttons tappable-through to walks — rejected: a busy radio
  option that *navigates* violates the radiogroup contract and surprises.

## D5. Back button placement and navigation semantics

**Decision**: A ghost/outline 8bit `Button` at the top of the walk screen
(above the start line, left-aligned), `arrowLeft` icon + label from i18n
(`m.walk.backHome`), `min-h-11` (≥ 44 px), `onClick={() => router.push('/')}`.
`push`, not `replace` — the browser back gesture then returns to the walk,
matching the new free-navigation model. No `arrow-left` icon exists in the
generated set: add `arrowLeft: 'arrow-left'` to the `MAP` in
`scripts/gen-icons.mjs` and run `npm run gen:icons` (generated file is
committed, never hand-edited).

**Rationale**: pixelarticons ships `arrow-left`; the icon pipeline is the
sanctioned way to add it (constitution VII). Top placement is what the user
asked for; the bottom sticky zone stays reserved for End/Cancel (§ 6.7.5
thumb zone).

**Amended during implementation** (user request): the back control is a
`next/link` text link identical to the settings screen — `font-pixel` dim
styling with the shared `m.settings.backHome` label («← На главную»); the
`arrowLeft` icon and `walk.backHome` keys were dropped. Similarly, D3's card
was rebuilt on the 8bitcn `Card`/`CardContent` (compact `--card-spacing`)
instead of `.pixel-panel`, per user request.

**Alternatives considered**:
- `router.back()` — rejected: on a cold direct open of `/walk/[id]` there is
  no in-app history entry; `push('/')` is deterministic.
- Icon-only button — rejected: 8bitcn buttons carry labels; icon-only hurts
  discoverability on a shared tablet.

## D6. TeamWalk_TZ.md amendment

**Decision**: Amend in the same PR (constitution I): in § 6.3 replace the
bullet «При открытии главной страницы приложение проверяет наличие активной
прогулки… сразу открывает этот экран» with the home active-walk card + back
button behavior; update the § 6.1 landing note (around line 400) that
justifies the start-flow subscription pause by the § 6.3 auto-redirect race —
the pause survives but its rationale becomes "no card swap under the
countdown overlay". Grep for other «авторедирект»/«6.3» references during
implementation.

**Rationale**: The TZ is the source of truth; the feature would otherwise
contradict it, which Principle I forbids. Amending the TZ is the sanctioned
path for intentional behavior changes.

## D7. Testing approach

**Decision**: Keep new logic in pure, vitest-testable helpers: the reworked
`startBlocker` (structured result: `{ kind: 'busy', walks: [...] } | { kind:
'hint', text } | null`) gets a unit test file `tests/start-blocker.test.ts`
(ru-pinned strings for the surviving text hint). i18n parity is enforced by
the `Messages` type + existing `tests/i18n.test.ts`. Component rendering and
navigation are validated via quickstart scenarios on the preview deploy —
the repo has no React component-test infrastructure and this feature does not
justify introducing one.

**Rationale**: Matches existing repo practice (all `tests/*.test.ts` are pure
TS); the 80% target applies to the new pure logic, which is fully covered.
