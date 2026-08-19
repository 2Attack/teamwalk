# Implementation Plan: Per-User Statistics Page

**Branch**: `feature/005-user-stats-page` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-user-stats-page/spec.md`

## Summary

A stats control on every leaderboard row opens `/stats/[id]` — a per-participant page with an identity header (avatar, name, back link) and one chart block: a daily bar chart of the last 30 calendar days showing walked time and distance, built on the 8bitcn chart-bar block (shadcn chart + recharts). Data comes from a new `GET /api/users/[id]/daily` endpoint that aggregates **finished** walks by office day (same `TZ` day math as streaks/leaderboard) and zero-fills missing days server-side.

## Technical Context

**Language/Version**: TypeScript strict, Next.js App Router, React 19, Node runtime

**Primary Dependencies**: Drizzle + Neon HTTP, SWR, Zod; **new**: `recharts` via `npx shadcn add @8bitcn/chart-bar` (copy-paste kit per docs/8BITCN.md)

**Storage**: existing `walks`/`users` tables; aggregates computed on demand, never stored (Constitution II)

**Testing**: vitest — unit test for the pure zero-fill/series helper; `npm run typecheck` primary gate

**Performance**: one indexed aggregate query per page view (`walks_user_started_idx` covers it); chart data ≤ 30 rows

**Constraints**: page behind the optional PIN gate automatically (proxy matcher gates everything by default); no per-user auth (Constitution platform constraints)

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec source of truth | PASS | Day attribution mirrors streak/leaderboard rules explicitly (spec edge case). |
| II. Stateless, DB owns state | PASS | Daily series computed from `walks` per request; no stored aggregates (FR-010). |
| III. Typed contracts | PASS | New DTOs in `lib/types.ts`; uuid validated via `uuidSchema`; errors via `apiError`/`handle`; `numeric` coerced with `Number(...)`; client via SWR hook + `apiGet`. |
| IV. Localization structural | PASS | New `statsPage.*` + leaderboard key in all three dictionaries; `Messages` type enforces parity. |
| V. LLM off hot path | PASS | No LLM. |
| VI. Time through one module | PASS | Day boundaries via `toOfficeDay`/`addOfficeDays`/`officeDayStart`; SQL bucket uses the same `TZ` constant from `lib/config`. |
| VII. Pixel UI discipline | PASS | 8bitcn chart-bar block; tokens only; Google-Fonts import stripped from `retro.css` after install (docs/8BITCN.md); icons via `@/components/ui/icon`; touch targets ≥ 44 px. |
| Workflow | PASS | Feature branch; `npm run typecheck` + `npm test` gates. |

**Post-design re-check**: PASS — no schema changes, no new perimeter, one new dependency (recharts) arriving through the sanctioned UI-kit path.

## Design Decisions

- **D1 Endpoint**: new `GET /api/users/[id]/daily` returning `UserDailyStatsDto { user, days[] }` (30 entries, ascending, zero-filled). Separate from the existing `/stats` endpoint so the walk screen's `useUserStats` payload doesn't grow.
- **D2 Aggregation**: one `GROUP BY` over finished walks bucketed by `to_char(started_at AT TIME ZONE <TZ>, 'YYYY-MM-DD')` with `started_at >= officeDayStart(today − 29d)`; matches `toOfficeDay` exactly (both are IANA-zone local dates).
- **D3 Zero-fill**: pure helper `buildDailySeries` in `lib/stats/daily.ts`, unit-tested (TDD) — continuous 30-day axis (FR-005), rounding km to hundredths like the leaderboard.
- **D4 Chart**: 8bitcn chart-bar block installed via shadcn CLI. *(Amended during implementation)*: dual hidden Y axes turned out broken in recharts 3.8 (hidden `yAxisId` axes don't get per-series domains — bars rendered 0–2 px), so each series is instead **normalized to its own maximum (0–100)** for bar heights, which equally guarantees neither metric crushes the other; exact values live in the tooltip (`formatKm`/`formatDurationHuman` from the raw payload). Legend + short numeric date ticks.
- **D5 Entry point**: a narrow trailing column on each leaderboard row with an icon `Button` (`size="icon"`, ≥44 px touch target, `aria-label` with the participant's name) wrapped in a `Link` to `/stats/[id]`; part of the flex card on mobile.
- **D6 Page**: `app/stats/[id]/page.tsx` client page — back link to `/`, header with `Avatar` + name, one chart `Card`; skeleton while loading; localized empty state when all 30 days are zero; API 404 → localized not-found state.
- **D7 Route naming**: `/stats/[id]` (flat, like `/walk/[id]`); the PIN proxy gates it by default — no matcher changes.

## Project Structure

```text
app/stats/[id]/page.tsx            # new page
app/api/users/[id]/daily/route.ts  # new endpoint
lib/db/queries/daily.ts            # aggregate finished walks by office day
lib/stats/daily.ts                 # pure zero-fill/series builder (unit-tested)
lib/types.ts                       # + DailyStatDto, UserDailyStatsDto
lib/config.ts                      # + STATS_DAYS = 30
lib/client/api.ts                  # + useUserDaily(userId)
components/StatsDailyChart.tsx     # chart block on 8bitcn chart
components/Leaderboard.tsx         # + stats control column
components/ui/chart.tsx            # installed by shadcn CLI (base, never hand-edited)
components/ui/8bit/chart.tsx       # installed 8bitcn wrapper
lib/i18n/messages/{ru,en,es}.ts    # + statsPage.*, leaderboard.statsAria
tests/daily-stats.test.ts          # series builder tests
specs/005-user-stats-page/         # spec artifacts
```

## Complexity Tracking

No violations. One new runtime dependency (recharts) — mandated by the requested UI-kit block, arriving via the standard 8bitcn install path.
