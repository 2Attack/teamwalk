# Tasks: Per-User Statistics Page

**Input**: Design documents from `/specs/005-user-stats-page/` (spec.md, plan.md)

**Tests**: Included — unit tests for the pure daily-series builder (TDD), consistent with the repo's vitest gates.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Create branch `feature/005-user-stats-page` from `main`
- [X] T002 Install the chart kit: `npx shadcn@latest add @8bitcn/chart-bar` (brings recharts + `components/ui/chart.tsx` + `components/ui/8bit/chart.tsx`); then remove the Google-Fonts `@import` that reappears in `components/ui/8bit/styles/retro.css` and drop any unused demo block files (per docs/8BITCN.md)

## Phase 2: Foundational

- [X] T003 Add `STATS_DAYS = 30` to `lib/config.ts`; add `DailyStatDto { day, km, durationSec, walksCount }` and `UserDailyStatsDto { user, days }` to `lib/types.ts`

## Phase 3: User Story 1 — Open a teammate's stats from the leaderboard (P1) 🎯 MVP

- [X] T004 [US1] TDD: write `tests/daily-stats.test.ts` for `buildDailySeries` (continuous 30 days ascending ending today, zero-fill, km rounding, multi-walk day summing) — must fail first
- [X] T005 [US1] Implement pure `buildDailySeries` in `lib/stats/daily.ts`; tests green
- [X] T006 [US1] Add `getDailyTotals(userId, sinceDay)` in `lib/db/queries/daily.ts` — finished walks grouped by office day via `AT TIME ZONE` bucket using `TZ` from `lib/config`
- [X] T007 [US1] Add `GET /api/users/[id]/daily` in `app/api/users/[id]/daily/route.ts` (uuid validation, 404 for unknown user, DTO exactly `UserDailyStatsDto`)
- [X] T008 [US1] Add `useUserDaily(userId)` SWR hook in `lib/client/api.ts`
- [X] T009 [US1] Build `components/StatsDailyChart.tsx` on the 8bitcn chart: grouped bars, two hidden Y axes (minutes / km), legend, tooltip with `formatKm` + `formatDurationHuman`, short date ticks, mobile-safe
- [X] T010 [US1] Build `app/stats/[id]/page.tsx`: back link to `/`, avatar + name header, chart card, loading skeleton, localized not-found state
- [X] T011 [US1] Add the stats control to `components/Leaderboard.tsx`: trailing icon-button column linking to `/stats/[id]`, ≥44 px target, `aria-label` with the name, mobile card placement
- [X] T012 [US1] Add `statsPage.*` + leaderboard stats-control strings to `lib/i18n/messages/{ru,en,es}.ts` (type-enforced parity)

## Phase 4: User Story 2 — Readable chart values (P2)

- [X] T013 [US2] Verify tooltip/legend show exact localized values in product formats; both metrics visually distinct (colors from `app/globals.css` tokens); adjust `StatsDailyChart` as needed

## Phase 5: User Story 3 — Empty and edge states (P3)

- [X] T014 [US3] Empty state: all-zero 30 days renders the localized "no walks yet" message in the chart card; unknown id renders not-found; verify active (unfinished) walks are excluded

## Phase 6: Polish & Verification

- [X] T015 Run `npm run typecheck` and `npm test` — green
- [X] T016 Local E2E via dev server: open leaderboard → stats control → page shows chart matching seeded walks; check phone viewport
- [X] T017 Commit and push the branch; confirm the preview deploy builds

## Dependencies

T001 → T002 → T003 → (T004 → T005) → T006 → T007 → T008 → (T009, T010, T011, T012 — T009/T011/T012 parallelizable, T010 needs T008/T009/T012) → T013 → T014 → T015 → T016 → T017
