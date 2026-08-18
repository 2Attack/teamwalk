# Tasks: Treadmill Busy Telegram Notification

**Input**: Design documents from `/specs/004-treadmill-busy-notify/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/busy-notification.md, quickstart.md

**Tests**: Included — the constitution's quality gates require vitest to pass, and plan D7 explicitly extends `tests/telegram.texts.test.ts`. Text tests are written first (TDD) and must fail before the builder exists.

**Organization**: Tasks are grouped by user story. Note: US2 and US3 are small guards added to the same function US1 creates (`notifyAllTreadmillsBusy` in `lib/telegram/notify.ts`), so the stories execute sequentially — no cross-story parallelism on that file.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (busy broadcast), US2 (delivery window), US3 (once per episode)

## Phase 1: Setup

**Purpose**: Branch hygiene — `main` is production; a push deploys and migrates immediately.

- [X] T001 Create feature branch `feature/004-treadmill-busy-notify` from current `main` (`git checkout -b feature/004-treadmill-busy-notify`); leave the pre-existing unrelated dirty files (`README.md`, `docs/README.{es,ru}.md`, `.specify/templates/plan-template.md`) uncommitted

---

## Phase 2: Foundational

No foundational tasks — the feature builds entirely on shipped infrastructure (`notification_log`, `tryDedup`, `telegramEnabled`, `lib/time.ts`, `TelegramTexts` locale system). No schema changes, no migrations.

---

## Phase 3: User Story 1 — Know when it's pointless to go down (Priority: P1) 🎯 MVP

**Goal**: When a starting walk occupies the last free active treadmill, availability subscribers get one Telegram broadcast; the trigger user, active walkers, muted and unsubscribed users are excluded; walk-start latency is untouched.

**Independent Test**: With all-but-one treadmills occupied, a walk start on the last one produces exactly one broadcast to an eligible subscriber (verified via `notification_log` row `kind='busy'` + text tests); a start that leaves another treadmill free produces nothing.

### Tests for User Story 1 (write first, must fail)

- [X] T002 [US1] Add a `describe('allBusyText')` block to `tests/telegram.texts.test.ts`: non-empty result, count-neutral phrasing (ru-pinned assertions — e.g. contains no treadmill name placeholder, mentions no user), starts with the 🔴 marker, and repeated calls stay within the fixed variant pool; run `npx vitest run tests/telegram.texts.test.ts` and confirm it fails (builder doesn't exist yet)

### Implementation for User Story 1

- [X] T003 [US1] Add `allBusyVariants: readonly string[]` to the `TelegramTexts` interface in `lib/telegram/texts/types.ts` with a short doc comment (count-neutral "no free treadmills" pool, mirror of `freeVariants`) — this makes typecheck force all three locales
- [X] T004 [P] [US1] Add 3 Russian variants (reference locale) in `lib/telegram/texts/ru.ts`, 🔴-prefixed, count-neutral (valid for 1 or N treadmills), tone contract of `texts/types.ts` (walking/treadmill/chair/stats jokes only, no names)
- [X] T005 [P] [US1] Add 3 English variants in `lib/telegram/texts/en.ts` (same count, same style)
- [X] T006 [P] [US1] Add 3 Spanish variants in `lib/telegram/texts/es.ts` (same count, same style)
- [X] T007 [US1] Add `allBusyText(): string` builder in `lib/telegram/texts.ts` (random `pick` from `t.allBusyVariants`, no params), placed next to `freeText`; confirm T002 tests now pass
- [X] T008 [US1] Implement `notifyAllTreadmillsBusy(input: { walkId: string; startedByUserId: string })` in `lib/telegram/notify.ts` per `contracts/busy-notification.md`: `telegramEnabled()` guard → all-busy check (reuse the `wereAllTreadmillsBusy()` query semantics post-insert; 0 active treadmills ⇒ silent) → recipients query identical to `notifyTreadmillFreed` (`notifyFree = true`, not muted via `mutedUntil`, `userId != startedByUserId`, no active walk) → one shared `allBusyText()` sent regular (non-silent) to each chat; whole body in try/catch with `console.error('[telegram] notifyAllTreadmillsBusy failed', ...)`, never throws (window/dedup/tie-break guards arrive in US2/US3)
- [X] T009 [US1] Wire the trigger into `app/api/walks/start/route.ts`: after the successful insert, alongside the existing `waitUntil(notifyWalkStarted(walk))`, add `waitUntil(notifyAllTreadmillsBusy({ walkId: walk.id, startedByUserId: walk.userId }))`; import from `@/lib/telegram/notify`; no changes before the response

**Checkpoint**: broadcast works end-to-end (behind `telegramEnabled()`); text tests green; `npm run typecheck` green.

---

## Phase 4: User Story 2 — No noise outside working hours (Priority: P2)

**Goal**: The busy event outside the working window or on weekends is dropped, never deferred — same contract as the freed-up message.

**Independent Test**: Trigger the transition with a mocked/off-hours clock (or code inspection + preview spot check per quickstart.md): the function returns before the recipients query and no `notification_log` row is written for `kind='busy'`.

### Implementation for User Story 2

- [X] T010 [US2] Add the delivery-window guard at the top of `notifyAllTreadmillsBusy` in `lib/telegram/notify.ts`, copied from `notifyTreadmillFreed`: `isWeekend(toOfficeDay(now))` ⇒ return; `officeHour(now)` outside `[FREE_WINDOW_START_HOUR, FREE_WINDOW_END_HOUR)` ⇒ return; both via `lib/time.ts` and `lib/config.ts` imports already present in the file; no queueing or rescheduling

**Checkpoint**: off-window events are silently dropped; behavior symmetric with `notifyTreadmillFreed`.

---

## Phase 5: User Story 3 — Exactly one message per busy episode (Priority: P2)

**Goal**: At most one broadcast per all-busy transition under retries and concurrent starts; a new transition (free → taken again) announces anew.

**Independent Test**: Invoke `notifyAllTreadmillsBusy` twice with the same `walkId` (or replay the start event): one `notification_log` row `kind='busy'`, `dedup_key='busy:<walkId>'`, one send. A fresh walkId after a free/busy cycle produces a new row and a new send.

### Implementation for User Story 3

- [X] T011 [US3] In `notifyAllTreadmillsBusy` (`lib/telegram/notify.ts`), after the all-busy check add the concurrent-start tie-break per research.md D2: select the most recently started active walk (`walks` where `status='active'` ordered by `startedAt` desc limit 1); if its id ≠ `input.walkId`, return silently — of two simultaneous last-treadmill starts only the latest announces
- [X] T012 [US3] Add the idempotency guard after the tie-break: `if (!(await tryDedup(input.startedByUserId, 'busy', \`busy:${input.walkId}\`))) return;` — reusing the existing `tryDedup` helper; recipients query and send remain below the guard

**Checkpoint**: all 8 behavioral guarantees of `contracts/busy-notification.md` are implemented.

---

## Phase 6: Polish & Verification

**Purpose**: Quality gates and end-to-end validation per quickstart.md.

- [X] T013 Run `npm run typecheck` — must be green (also proves en/ru/es variant parity via the `TelegramTexts` type)
- [X] T014 Run `npm test` — full vitest suite green (locale pinned to `ru`)
- [X] T015 Local behavioral check per `quickstart.md`: with Telegram off, fill all treadmills via the dev UI/API and verify no `kind='busy'` rows appear in `notification_log` and walk-start responses are unchanged
- [X] T016 Review the diff against the constitution gates in `plan.md` (no hardcoded strings outside locale files, errors swallowed and logged, no hot-path additions), then commit `feat: telegram broadcast when the last free treadmill is taken` and push `feature/004-treadmill-busy-notify` with `-u`; confirm the preview deploy builds and walk flows work (Telegram silent on preview)

---

## Phase 7: Follow-up — name the taken treadmill (2026-08-18, post-release amendment)

**Purpose**: Product-owner request after the v1 release: the 🔴 message must say which treadmill was taken. See amended research.md D5 and contracts/busy-notification.md.

- [X] T017 Update the `allBusyText` test in `tests/telegram.texts.test.ts` to expect the treadmill name (TDD: RED first)
- [X] T018 Change `allBusyVariants` to `(i: { treadmillName: string })` in `lib/telegram/texts/types.ts`; rewrite the three variants in `ru/en/es` to name the taken treadmill; update `allBusyText(i)` in `lib/telegram/texts.ts`
- [X] T019 Add `treadmillName` to `notifyAllTreadmillsBusy` input in `lib/telegram/notify.ts`; pass `walk.treadmillName` from `app/api/walks/start/route.ts`
- [X] T020 Gates: `npm run typecheck` + `npm test` green; local smoke via dev server; amend research.md D5 and the contract; commit on `feature/004-busy-notify-treadmill-name`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — do first (branch before any edits)
- **US1 (Phase 3)**: after Setup; T002 → T003 → {T004, T005, T006 in parallel} → T007 → T008 → T009
- **US2 (Phase 4)**: after T008 (edits the same function)
- **US3 (Phase 5)**: after T010 (guard ordering inside the function: window → all-busy → tie-break → dedup); T011 → T012
- **Polish (Phase 6)**: after all stories; T013/T014 may run in parallel, then T015 → T016

### Parallel Opportunities

- T004, T005, T006 (three locale files, independent once T003 lands the interface).
- Everything else is sequential — US1→US3 converge on `lib/telegram/notify.ts`, and the test-first ordering pins the rest.

## Parallel Example: User Story 1

```bash
# After T003 (interface) — three locale files in parallel:
Task: "Add 3 Russian variants in lib/telegram/texts/ru.ts"
Task: "Add 3 English variants in lib/telegram/texts/en.ts"
Task: "Add 3 Spanish variants in lib/telegram/texts/es.ts"
```

## Implementation Strategy

**MVP = US1** (T001–T009): the broadcast itself, correct recipients, zero hot-path cost. Independently testable and demoable.

**Merge scope = all three stories.** US2 (window) and US3 (dedup/tie-break) are a handful of guard lines each; shipping US1 to production without them would spam off-hours or duplicate under races. Complete Phases 3–5 on the branch, validate at each checkpoint, deploy once — the incremental structure exists for review and rollback clarity, not for staged production releases.

## Notes

- Single-developer feature; the only real parallelism is the three locale files.
- Guard order inside `notifyAllTreadmillsBusy` ends up: enabled → window → all-busy → tie-break → dedup → recipients → send (cheap checks first, DB writes last).
- Commit after each checkpoint or logical group; never commit to `main`.
