# Contracts: First-Place Fireworks

**No external contract changes.**

- No new or modified API endpoints; no changes to `lib/types.ts` DTOs or
  `lib/validation.ts` schemas.
- The feature reads the existing `GET /api/leaderboard?period=…` response
  (`LeaderboardDto`) through the existing `useLeaderboard` hook and derives the
  leader client-side.
- Internal module surface introduced (documented in [data-model.md](../data-model.md)):
  - `lib/client/leader-transition.ts` — pure `observe()` transition function.
  - `components/FireworksOverlay.tsx` — props: `burstId: number`,
    `onDone(): void`; renders a fixed, `aria-hidden`, pointer-transparent canvas.

This file exists so `/speckit-analyze` can verify the "no API surface change"
claim instead of inferring it from absence.
