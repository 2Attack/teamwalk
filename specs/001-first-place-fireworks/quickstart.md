# Quickstart Validation: First-Place Fireworks

Runnable scenarios proving the feature end-to-end. Prerequisites: local DB per README
("Postgres + neon-http-proxy" pair) with `DATABASE_URL` in `.env.development.local`, or any
preview deploy.

## Setup

```bash
npm run dev
```

Seed a takeover situation: two participants whose week distances are close (e.g. via two
short walks). The leaderboard refreshes every 30 s while the page is open.

## Scenario 1 — leader change fires once (spec US1, SC-001..003)

1. Open the home page in **two** browser windows; note the current #1 on the Week tab.
2. As the #2 participant, start and finish a walk long enough to overtake #1.
3. Within one refresh cycle (≤ 30 s) both windows must: reorder the podium AND play the
   fireworks burst once.
4. While the burst plays, click tabs/buttons — every interaction must land normally.
5. Wait ~6 s: the effect is gone; DevTools → Performance shows no ongoing rAF work.

**Expected**: one burst per window, ≤ 6 s, zero intercepted clicks, no residual activity.

## Scenario 2 — no fire on load, reload, or tab switch (FR-004)

1. Reload the page after the takeover — no burst on initial render.
2. Switch Week → All time and back (different leaders) — no burst on either switch.

## Scenario 3 — reduced motion (US2, SC-004)

1. DevTools → Rendering → "Emulate CSS prefers-reduced-motion: reduce".
2. Repeat Scenario 1's takeover.

**Expected**: podium updates, zero celebratory frames.

## Scenario 4 — hidden tab (edge case, research D5)

1. Hide one window (switch to another tab) before the takeover lands, keep the other visible.
2. Return after the refresh cycle.

**Expected**: hidden window shows the new standings without a late burst; visible window
celebrated normally.

## Automated checks

```bash
npm run typecheck                             # primary gate
npm test                                      # full suite
npx vitest run tests/leader-transition.test.ts  # detector truth table (see data-model.md)
```

All detector cases from [data-model.md](./data-model.md) must be covered and green.
