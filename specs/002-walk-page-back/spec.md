# Feature Specification: Walk Screen Back Button, No Home Auto-Redirect, Rich Active-Walk Cards

**Feature Branch**: `002-walk-page-back`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "на странице ходьбы нужно вверху сделать кнопку назад, а также на главной не должно редиректить на страницу ходьбы если есть активная прогулка, также нужно сделать более красивый ui/ux вместо текущего «сейчас на дорожке Егор К, идёт 01:31» — с переходом на страницу с ходьбой"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Home stays home when a walk is active (Priority: P1)

A participant with a walk in progress opens the home page (or navigates back to it). Today the app instantly force-redirects them to the walk screen (spec § 6.3), so home is unreachable while walking. After this feature, home renders normally: team progress, podium, leaderboard — and, instead of the start controls, a clear "walk in progress" card for the selected participant with an explicit action to open the walk screen.

**Why this priority**: The forced redirect is the root blocker — it makes both the back button (US3) and any home-side walk UI (US2) pointless, because home would bounce the user straight back. Everything else builds on removing it.

**Independent Test**: Start a walk, navigate to `/` directly (address bar). Home must render and stay; no automatic navigation to `/walk/[id]` occurs. The walk keeps running (timer source of truth is `walks.started_at`, untouched).

**Acceptance Scenarios**:

1. **Given** the selected participant has an active walk, **When** they open the home page, **Then** the page renders fully and does not auto-navigate to the walk screen.
2. **Given** the selected participant has an active walk, **When** home renders, **Then** the start block area shows an active-walk card with an explicit "open walk" action instead of treadmill/speed/start controls.
3. **Given** the start flow (countdown → POST → navigation) is running, **When** the walk is created, **Then** the app still navigates to the walk screen exactly once (the start flow's own navigation is kept).
4. **Given** a participant presses "Start walk" while they already have an active walk (409 `WALK_ALREADY_ACTIVE`), **When** the conflict is detected, **Then** the app still resolves it by navigating to that active walk (explicit user intent — unchanged behavior).

---

### User Story 2 - Rich in-progress walk cards with tap-through (Priority: P2)

Instead of the plain grey text «сейчас на дорожке Егор К, идёт 01:31» under a disabled start button, the participant sees a proper pixel-styled card: the walker's avatar, name, treadmill, a live ticking duration, current speed — and the card (or its action button) navigates to that walk's screen. The same card style serves two contexts: "your own walk in progress" (resume) and "treadmill busy by someone else" (observe).

**Why this priority**: This is the visible UX payoff of the feature; depends on US1 only for the "own walk" case (tap-through to a page that no longer bounces).

**Independent Test**: With one treadmill busy by another participant, home shows the busy card with a live timer; tapping it opens `/walk/[id]` of that walk (view works on any device via the `/api/stats` fallback already in place).

**Acceptance Scenarios**:

1. **Given** the selected participant has an active walk, **When** home renders, **Then** the active-walk card shows avatar, name, treadmill name, live `MM:SS`/`H:MM:SS` duration and current speed, plus a prominent "open walk" button navigating to `/walk/[id]`.
2. **Given** the only treadmill is busy by someone else, **When** home renders the start block, **Then** the old text blocker is replaced by a busy-walk card (avatar, name, live duration) that navigates to that walk's screen on tap.
3. **Given** all of several treadmills are busy, **When** home renders the start block, **Then** each busy walk is shown as a card (same component), each tappable.
4. **Given** the walk finishes or is cancelled from another device, **When** SWR refreshes home data, **Then** the card disappears and the normal start controls return without a page reload.
5. **Given** the participant picker (UserSelect), **When** the active-walk card is shown, **Then** switching the participant remains possible (shared-tablet flow) — the card applies only to the selected participant.

---

### User Story 3 - Back button on the walk screen (Priority: P2)

At the top of the active-walk screen there is a back control that returns to home without touching the walk: no finish, no cancel, the timer keeps running (it is derived from `started_at`, so leaving the screen loses nothing).

**Why this priority**: Completes the loop opened by US1 — the user can now move freely between home and the walk screen in both directions.

**Independent Test**: Open an active walk, tap the back button — home renders (with the active-walk card from US2); reopen the walk via the card — timer shows the correct total elapsed time.

**Acceptance Scenarios**:

1. **Given** an active walk screen, **When** the back button at the top is tapped, **Then** the app navigates to `/` and the walk remains active.
2. **Given** the walk screen after returning home and reopening, **When** the timer renders, **Then** it shows time elapsed since `started_at` (no reset, no drift).
3. **Given** touch-target rules (spec § 8), **When** the back button renders, **Then** its hit area is ≥ 44 px.

---

### Edge Cases

- Walk finished/cancelled from another device while its card is on screen elsewhere: tap-through lands on the walk page, which already handles the "walk is gone" case (redirect home / NotFound screen).
- `localStorage` unavailable (private mode): home simply shows no selected participant, no active-walk card — busy-treadmill cards still work (they come from `/api/treadmills`).
- Start flow in progress: the active-walk SWR cache is seeded before navigation; home must not swap the start card for the resume card mid-countdown (subscription stays paused during the start flow, as today).
- Clock skew / negative elapsed: durations clamp to zero (existing `elapsedSec` behavior).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Home MUST NOT auto-navigate to the walk screen when the selected participant has an active walk. Navigation to a walk happens only on explicit user action (start flow, card tap, 409 conflict resolution).
- **FR-002**: When the selected participant has an active walk, home MUST show an active-walk card (avatar, name, treadmill name, live duration, current speed) with a primary action navigating to `/walk/[id]`, replacing treadmill/speed/start controls; participant switching stays available.
- **FR-003**: The plain-text busy blockers («сейчас на дорожке…», «все дорожки заняты…» tail) MUST be replaced with busy-walk cards showing avatar, name and live duration, each navigating to the corresponding `/walk/[id]`.
- **FR-004**: The walk screen MUST have a back control at the top navigating to `/` without altering walk state; hit area ≥ 44 px.
- **FR-005**: All new user-facing strings MUST go through `lib/i18n` dictionaries with full en/ru/es parity; obsolete keys are removed from all three.
- **FR-006**: `TeamWalk_TZ.md` MUST be amended in the same PR: § 6.3 auto-redirect clause replaced by the home active-walk card + back button behavior; the § 6.1 landing note that references the auto-redirect race updated accordingly.
- **FR-007**: Live durations on home MUST tick at 1 s only while at least one relevant walk is active (existing `useNowTick` discipline — the shared tablet stays open for hours).

### Key Entities

- **ActiveWalkDto** (existing): the selected participant's active walk — id, user, treadmill name, `startedAt`, current speed. Feeds the resume card. No changes.
- **TreadmillBusyDto** (existing): busy state of a treadmill — `walkId`, user (id, name, avatarId), `startedAt`, `speedKmh`. Feeds the busy card. No changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Opening `/` with an active walk performs zero automatic route changes (verifiable in the browser: URL stays `/`).
- **SC-002**: From home, a user reaches their in-progress walk in one tap; from the walk screen, home in one tap.
- **SC-003**: Who-is-walking information on home (name + live duration) is visible without reading fine print under a disabled button — presented as a card consistent with the 8bitcn system.
- **SC-004**: `npm run typecheck` and `npm test` pass; i18n key parity holds across en/ru/es (enforced by the `Messages` type).

## Assumptions

- Anyone may open anyone's walk screen (trust model "our own people", no auth by design); the walk page's existing `/api/stats` fallback already supports viewing walks not owned by the device.
- The start flow's own navigation (prime cache → prefetch → push) is kept exactly as is; only the home-side *passive* redirect is removed.
- The 409 `WALK_ALREADY_ACTIVE` handler in the start card keeps redirecting — that path is an explicit "Start" press, not a passive redirect.
- No DB, API or DTO changes: `TreadmillBusyDto.walkId` already exists for tap-through.
