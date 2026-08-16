# Tasks: First-Place Fireworks

**Input**: Design documents from `/specs/001-first-place-fireworks/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — the project mandates TDD, and plan/research (D7) scope automated
tests to the pure detector; the canvas overlay is validated via quickstart scenarios.

**Organization**: Grouped by user story. US1 is the whole visible feature (MVP); US2 is
the reduced-motion guarantee layered onto US1's wiring point.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: [US1] celebrate leader change, [US2] respect reduced motion

## Path Conventions

Single Next.js project at repo root: `lib/`, `components/`, `tests/` (per plan.md
Project Structure).

## Phase 1: Setup (Shared Infrastructure)

No setup tasks. The feature adds zero dependencies, zero configuration, and no schema or
API changes (plan.md Technical Context, contracts/README.md).

---

## Phase 2: Foundational (Blocking Prerequisites)

No foundational tasks. All required infrastructure already exists: `useLeaderboard` SWR
hook (`lib/client/api.ts`), palette tokens (`app/globals.css`), vitest setup (`tests/`).

---

## Phase 3: User Story 1 - Celebrate a leader change on the podium (Priority: P1) 🎯 MVP

**Goal**: every open screen showing the podium plays a one-shot pixel fireworks burst when
the displayed first place changes hands; effect is decorative, ≤ 6 s, leaves nothing behind.

**Independent Test**: quickstart.md Scenarios 1, 2, 4 (two windows, takeover walk, no fire
on load/reload/tab-switch, hidden-tab skip) plus `npx vitest run tests/leader-transition.test.ts`.

### Tests for User Story 1 (write first, must fail)

- [x] T001 [P] [US1] Write failing table-driven unit tests for the `observe()` transition
      function in `tests/leader-transition.test.ts` — all six truth-table cases from
      data-model.md (initial null state, period-key change, same leader, leader change,
      podium emptied, re-population baseline), asserting both `fire` and `next`.

### Implementation for User Story 1

- [x] T002 [US1] Implement `LeaderWatchState` type and pure `observe(prev, periodKey,
      leaderId)` function in `lib/client/leader-transition.ts` per data-model.md; make
      T001 tests pass. No React imports — plain TS module.
- [x] T003 [P] [US1] Implement `FireworksOverlay` in `components/FireworksOverlay.tsx`
      per research D1/D2/D6: props `{ burstId: number; onDone(): void }`; fixed
      `inset-0`, `pointer-events-none`, `aria-hidden`, high z-index canvas; ~80–120
      axis-aligned square particles (4–8 px, DPR-scaled, positions snapped to integers,
      `imageSmoothingEnabled = false`); palette read once per burst from computed
      `--color-citrus`, `--color-lime`, `--color-silver`, `--color-bronze`; single rAF
      loop that exits when all particles expire or at the 6 s hard cap, then calls
      `onDone`. Cancel rAF and free everything on unmount. No new dependencies.
- [x] T004 [US1] Wire detection into `components/Podium.tsx`: hold
      `LeaderWatchState | null` in a `useRef`; on each rendered rows/period change call
      `observe()` with the `useLeaderboard` SWR key as `periodKey` and first-place user id
      (or null); on `fire`, skip if `document.visibilityState === 'hidden'` (research D5),
      else bump a `burstId` state; render `<FireworksOverlay>` only while a burst is
      active and clear it in `onDone` (FR-003: restart, never queue).
- [x] T005 [US1] Validate: `npm run typecheck`, `npm test`, then quickstart.md
      Scenarios 1, 2 and 4 against local dev (`npm run dev`); confirm the burst is
      silent (FR-007 — no audio APIs anywhere in the new code).
      *Done 2026-08-16 on local dev: 4 leader takeovers via seeded walks — burst
      renders in palette colors, ends and unmounts within 6 s (FR-006), no fire on
      reload or period-tab switches (FR-004), click during burst lands (FR-002).*

**Checkpoint**: US1 fully functional — celebration fires exactly on observed leader
changes and never intercepts input.

---

## Phase 4: User Story 2 - Respect viewers who opt out of motion (Priority: P2)

**Goal**: a viewer with the system reduced-motion preference never sees a single
celebratory frame.

**Independent Test**: quickstart.md Scenario 3 (DevTools emulation of
`prefers-reduced-motion: reduce`, repeat the takeover, zero frames).

### Implementation for User Story 2

- [x] T006 [US2] Gate the fire signal in `components/Podium.tsx` with
      `useReducedMotion()` from `motion/react` (existing pattern in
      `components/AchievementToast.tsx`): when reduced, `observe()` state still advances
      but `fire` is discarded before the visibility check, so the overlay never mounts
      (research D4).
- [ ] T007 [US2] Validate: quickstart.md Scenario 3; re-run `npm run typecheck` and
      `npm test`.
      *typecheck/test green; Scenario 3 needs DevTools reduced-motion emulation —
      not scriptable in this setup, verify by hand locally or on the preview.*

**Checkpoint**: both stories complete; all functional requirements FR-001..FR-008 covered.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T008 [P] Add the new module and component to `docs/CONTRACT.md` (zone map):
      `lib/client/leader-transition.ts` exports `observe`/`LeaderWatchState`;
      `components/FireworksOverlay.tsx` props contract per contracts/README.md.
- [ ] T009 Push `feature/first-place-fireworks`, verify the preview deploy, and run the
      full quickstart.md pass there (previews are the project's canonical verification
      step before merging to `main`).

---

## Dependencies & Execution Order

### Phase Dependencies

- Phases 1–2: empty — implementation can start immediately.
- Phase 3 (US1): T001 → T002 → T004; T003 is independent of T001/T002 and only blocks
  T004. T005 after T002–T004.
- Phase 4 (US2): T006 depends on T004 (edits the same wiring in `Podium.tsx`);
  T007 after T006.
- Phase 5: T008 anytime after T002+T003 (docs of final surface); T009 last.

### Parallel Opportunities

- T001 (tests) and T003 (overlay component) touch different files and can run in parallel.
- T008 can run in parallel with T009's preview wait.
- US2 is intentionally sequential after US1 — it modifies the same integration point
  (`Podium.tsx`), so parallelizing would conflict.

## Parallel Example: User Story 1

```bash
# In parallel (different files, no shared deps):
Task: "T001 failing unit tests in tests/leader-transition.test.ts"
Task: "T003 FireworksOverlay in components/FireworksOverlay.tsx"
```

## Implementation Strategy

MVP = Phase 3 (US1) alone: detector + overlay + Podium wiring gives the full visible
feature. US2 is a small, mandatory follow-up before merge (constitution/TZ commitment),
not an optional nice-to-have — the branch should not be merged with only US1 done.
Suggested commit granularity: one commit per task or per checkpoint, conventional
`feat:`/`test:`/`docs:` types.
