# Quickstart Validation: 002-walk-page-back

## Prerequisites

- `.env.local` with `DATABASE_URL` (Neon) — or the local "Postgres + neon-http-proxy" docker pair from the README with `.env.development.local`.
- At least two participants and one active treadmill in the DB (create via the UI).

## Setup

```bash
git checkout 002-walk-page-back
npm install
npm run dev            # http://localhost:3000
```

## Automated gates (must pass)

```bash
npm run typecheck      # primary check — also proves i18n key parity (Messages type)
npm test               # vitest, ru-pinned; includes tests/start-blocker.test.ts
```

Expected: both exit 0.

## Scenario 1 — no auto-redirect (US1 / FR-001)

1. On home, select participant A, start a walk (countdown → walk screen opens — start-flow navigation still works).
2. In the address bar, open `http://localhost:3000/` directly.
3. **Expected**: home renders and stays (URL remains `/`); no bounce to `/walk/[id]`. The start block shows the resume card instead of treadmill/speed/start controls; `UserSelect` is still there.

## Scenario 2 — resume card (US2 / FR-002)

1. With A's walk active, look at the card: avatar, A's name, treadmill name, live duration ticking every second, current speed.
2. Tap the primary action.
3. **Expected**: `/walk/[id]` opens, timer shows total elapsed since start (no reset).
4. Switch `UserSelect` to participant B (no active walk).
5. **Expected**: normal start controls return for B.

## Scenario 3 — busy card with tap-through (US2 / FR-003)

1. As B (on home, A still walking on the only treadmill): the start button is blocked.
2. **Expected**: instead of the old grey text «сейчас на дорожке …, идёт …», a busy card with A's avatar, name and live duration; tapping it opens A's walk screen (read-only trust model — screen is fully functional by design).
3. If a second treadmill exists and both are busy: one card per busy walk, longest first.

## Scenario 4 — back button (US3 / FR-004)

1. On A's walk screen, find the back control at the top (≥ 44 px target).
2. Tap it.
3. **Expected**: home opens; the walk is still active (resume card present). Browser Back returns to the walk screen.
4. Reopen the walk via the card: timer continuous, distance keeps accruing.

## Scenario 5 — walk ends elsewhere (edge case)

1. With the resume/busy card visible on device 1, finish (or cancel) the walk from device 2 (or another browser profile).
2. **Expected**: after the next SWR refresh the card disappears and start controls return without a page reload; tapping a stale card lands on the walk page's existing "walk is gone" handling (home redirect / not-found screen).

## Scenario 6 — TZ and docs consistency (FR-006)

```bash
grep -n "авторедирект\|сразу открывает этот экран" TeamWalk_TZ.md
```

**Expected**: § 6.3 no longer mandates the auto-open; § 6.1 landing note no longer cites the § 6.3 redirect race. `docs/CONTRACT.md` lists `WalkInProgressCard` if component zones are registered there.

## Preview deploy check

Push the branch → Vercel preview (own Neon DB branch). Re-run Scenarios 1–4 on the preview URL before merging to `main`.
