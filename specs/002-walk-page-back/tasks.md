# Tasks: Walk Screen Back Button, No Home Auto-Redirect, Rich Active-Walk Cards

**Input**: Design documents from `/specs/002-walk-page-back/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D7), data-model.md, contracts/ui-contract.md, quickstart.md

**Tests**: Included per constitution (quality gates) and research D7 — new pure logic gets vitest coverage, written first (RED → GREEN); UI is validated via quickstart scenarios.

**Organization**: Tasks grouped by user story; each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (no auto-redirect + resume card), US2 (rich busy cards), US3 (back button)

## Phase 1: Setup

**Purpose**: Assets and dictionary keys every story draws from.

- [X] T001 [P] Add `arrowLeft: 'arrow-left'` to `MAP` in `scripts/gen-icons.mjs`, run `npm run gen:icons`, commit the regenerated `lib/icons.generated.ts` (never hand-edit it) — contracts/ui-contract.md "Icon contract"
- [X] T002 [P] Add new i18n keys to all three dictionaries `lib/i18n/messages/ru.ts` (reference), `lib/i18n/messages/en.ts`, `lib/i18n/messages/es.ts`: `walk.backHome`, `walkCard.inProgressTitle`, `walkCard.openWalk`, `walkCard.busyTitle`, and `walkCard.elapsed`/`walkCard.speed` if the card layout labels values (`Messages` type enforces parity; do NOT remove old blocker keys yet — they are still referenced until T009). Run `npm run typecheck`.

**Checkpoint**: `typecheck` green with new keys and icon.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared card component both US1 and US2 render.

**⚠️ CRITICAL**: T003 blocks US1 and US2 (not US3).

- [X] T003 Create `components/WalkInProgressCard.tsx` per contracts/ui-contract.md and data-model.md: props `{ walkId, user: {name, avatarId}, startedAt, speedKmh, treadmillName?, variant: 'resume' | 'busy' }`; renders `Avatar`, name (`font="normal"`), treadmill name, live duration (`elapsedSec` + `formatDuration` + `useNowTick` reused from `components/TreadmillPicker.tsx` / `lib/format.ts`), current speed; `variant="resume"` → primary 8bit `Button` (`m.walkCard.openWalk`, `min-h-11`+) with `router.push('/walk/' + walkId)`; `variant="busy"` → whole card tappable (≥ 44 px, link semantics) to the same route; 8bit `Card` frame, token colors only, zero radius, pixel `retro` only for title/action label

**Checkpoint**: Component compiles (`npm run typecheck`); not yet mounted anywhere.

---

## Phase 3: User Story 1 - Home stays home when a walk is active (Priority: P1) 🎯 MVP

**Goal**: Remove the passive auto-redirect; home renders fully with a resume card for the selected participant's active walk. Start-flow navigation and the 409 handler stay untouched (research D1).

**Independent Test**: quickstart.md Scenarios 1–2 — start a walk, open `/` directly: URL stays `/`, resume card shown, tap opens the walk with a continuous timer.

### Implementation for User Story 1

- [X] T004 [US1] In `app/page.tsx`: delete the redirect `useEffect` (lines 64–66) and the now-stale § 6.3 comment above it; keep the `useActiveWalk(restored && !startFlowActive ? userId : null)` subscription; pass `activeWalk ?? null` down as a new `activeWalk` prop to `StartWalkCard`; rewrite the `startFlowActive` comment block — its purpose is now "no start-card → resume-card swap under the countdown overlay" (research D1), not a navigation race
- [X] T005 [US1] In `components/StartWalkCard.tsx`: add `activeWalk: ActiveWalkDto | null` to `StartWalkCardProps`; when `activeWalk !== null`, render inside the existing `StartCard` frame only `UserSelect` + `<WalkInProgressCard variant="resume" ...>` mapped from `ActiveWalkDto` (data-model.md mapping) — no treadmill picker, no speed picker, no start button; keep the 409 `WALK_ALREADY_ACTIVE` redirect in `handleStartError` unchanged
- [X] T006 [US1] Validate: `npm run typecheck`, `npm test`, then quickstart.md Scenarios 1–2 on `npm run dev` (no auto-navigation; resume card content; participant switching restores start controls)

**Checkpoint**: MVP — free navigation home↔walk already works via the resume card (walk screen back button comes in US3).

---

## Phase 4: User Story 2 - Rich in-progress walk cards with tap-through (Priority: P2)

**Goal**: Replace the plain-text busy blockers («сейчас на дорожке …, идёт …») with tappable busy-walk cards; retire the obsolete strings. `TreadmillPicker`'s in-button busy label stays (research D4).

**Independent Test**: quickstart.md Scenario 3 — with the only treadmill busy by someone else, home shows a busy card with a live timer; tap opens that walk.

### Tests for User Story 2 (write first — RED)

- [X] T007 [US2] Create `tests/start-blocker.test.ts` for the structured blocker helper (to be extracted in T008 as `lib/start-blocker.ts`): single-treadmill-busy → `{ kind: 'busy', walks: [that walk] }`; all-of-several-busy → `{ kind: 'busy', walks }` ordered longest-walking first; free treadmill selected → `null`; none selected with free ones available → `{ kind: 'hint', text }` asserting the ru string (tests are ru-pinned); negative elapsed clamps to 0. Run `npx vitest run tests/start-blocker.test.ts` — MUST FAIL (module does not exist yet)

### Implementation for User Story 2

- [X] T008 [US2] Extract and rework `startBlocker` from `components/StartWalkCard.tsx` into pure `lib/start-blocker.ts` returning `{ kind: 'busy'; walks: BusyCardData[] } | { kind: 'hint'; text: string } | null` per data-model.md (`BusyCardData` = card props sans variant, mapped from `TreadmillDto`+`TreadmillBusyDto` incl. `walkId` and `treadmillName`); reuse `elapsedSec`; run the T007 test — MUST PASS
- [X] T009 [US2] In `components/StartWalkCard.tsx`: render the structured blocker — `kind: 'busy'` → `walkCard.busyTitle` caption + one `<WalkInProgressCard variant="busy">` per walk, `kind: 'hint'` → existing text row with clock icon; then remove `startCard.blockerSingleBusy` and `startCard.blockerAllBusyTail` from **all three** dictionaries (`ru.ts`, `en.ts`, `es.ts`); remove or repurpose `startCard.blockerAllBusy` per contracts/ui-contract.md; keep `treadmillPicker.busyLabel`
- [X] T010 [US2] Validate: `npm run typecheck`, `npm test` (incl. `tests/i18n.test.ts` parity), quickstart.md Scenario 3 with two browser profiles/participants

**Checkpoint**: US1 and US2 both work; the old grey blocker text is gone.

---

## Phase 5: User Story 3 - Back button on the walk screen (Priority: P2)

**Goal**: Top-of-screen back control returning home without touching walk state (research D5). Independent of US2; depends on T001 (icon) only.

**Independent Test**: quickstart.md Scenario 4 — tap back on the walk screen → home; reopen → timer continuous; hit area ≥ 44 px.

### Implementation for User Story 3

- [X] T011 [US3] In `app/walk/[id]/page.tsx`: add a back-control row at the top of `<main>` (above the start line in `<header>`): 8bit `Button` `variant="ghost"` `font="normal"`, left-aligned, `min-h-11`, `<Icon name="arrowLeft" size={16} />` + `m.walk.backHome`, `onClick={() => router.push('/')}` (push, not replace — browser Back returns to the walk)
- [X] T012 [US3] Validate: `npm run typecheck`, quickstart.md Scenario 4 (back → home shows resume card from US1; reopen → no timer reset; walk stays active)

**Checkpoint**: All three stories functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Spec/doc consistency (FR-006 is merge-blocking) and final gates.

- [X] T013 Amend `TeamWalk_TZ.md` (required before merge, FR-006 / research D6): in § 6.3 replace the bullet «При открытии главной страницы приложение проверяет наличие активной прогулки… сразу открывает этот экран» with the home active-walk card + top back-button behavior; update the § 6.1 landing note (~line 400) — the subscription pause now prevents the card swap under the countdown overlay, not a redirect race; `grep -n "авторедирект\|сразу открывает" TeamWalk_TZ.md` to catch stragglers
- [X] T014 [P] Register new exports in `docs/CONTRACT.md` if it maps component zones: `components/WalkInProgressCard.tsx`, `lib/start-blocker.ts`; check `README*` screenshots/texts for the removed redirect mention
- [X] T015 Final gates: `npm run typecheck` + `npm test`; run quickstart.md Scenarios 5–6 (walk ends elsewhere; TZ grep); push branch `002-walk-page-back`, verify Scenarios 1–4 on the Vercel preview (own Neon branch) before merging to `main`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 ∥ T002 — no dependencies
- **Foundational (Phase 2)**: T003 needs T002 (i18n keys); blocks US1 & US2
- **US1 (Phase 3)**: T004 ∥-able with T005 in principle, but both touch the `StartWalkCard` contract — do T004 → T005 → T006 sequentially
- **US2 (Phase 4)**: needs T003; T007 (RED) → T008 (GREEN) → T009 → T010
- **US3 (Phase 5)**: needs only T001; independent of US1/US2 code-wise (fully useful only with US1 merged — otherwise home redirects back)
- **Polish (Phase 6)**: T013 ∥ T014, then T015 last

### Parallel Opportunities

- T001 ∥ T002 (different files)
- US3 (T011–T012) can run in parallel with all of US1/US2 after T001+T002
- T013 ∥ T014 (different docs)

### Parallel Example

```bash
# After Phase 1+2, two tracks in parallel:
Track A: T004 → T005 → T006 → T007 → T008 → T009 → T010   # home + cards
Track B: T011 → T012                                       # walk-screen back button
```

---

## Implementation Strategy

**MVP = Phase 1 + 2 + US1 (T001–T006)**: home stops redirecting and already offers one-tap access to the walk — deployable increment.

Then incrementally: US2 (busy cards + string retirement), US3 (back button), Polish (TZ amendment is mandatory before merge — it is what keeps the constitution's Principle I gate green).

**Notes**: commit after each task or logical group (`feat:`/`refactor:`/`test:`/`docs:`); never push `main`; verify on the branch preview before merging.
