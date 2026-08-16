# Phase 0 Research: First-Place Fireworks

All Technical Context unknowns resolved. Decisions below reference spec FRs.

## D1. Rendering: hand-rolled canvas 2D, no library

- **Decision**: a single `<canvas>` drawn with a ~150-line particle system: one burst =
  N square particles with velocity, gravity, and per-particle TTL; drawn via
  `requestAnimationFrame`, loop exits when every particle expires or a hard 6 s cap hits.
- **Rationale**: TZ § 6.8 explicitly rejects "hundreds of kilobytes for a five-second
  effect". Popular options (`canvas-confetti`, `tsparticles`, `react-confetti`) draw smooth
  rounded confetti that violates FR-008 (pixel aesthetic) and add a dependency for less
  code than the hand-rolled version.
- **Alternatives considered**: `canvas-confetti` (~9 KB but wrong aesthetic, shapes not
  square-pixel, still a new dep); DOM/CSS particle divs (dozens of animated nodes on a weak
  tablet violate the spirit of the transform/opacity budget; canvas is the sanctioned
  "Layer 3" for exactly this); WebGL (absurd overkill).

## D2. Pixel look: integer grid + palette from CSS tokens

- **Decision**: particles are axis-aligned squares (4–8 CSS px, scaled by
  `devicePixelRatio`), positions snapped to whole pixels at draw time,
  `imageSmoothingEnabled = false`. Colors are read once per burst from computed CSS custom
  properties on `document.documentElement`: `--color-citrus`, `--color-lime`,
  `--color-silver`, `--color-bronze` (all defined in `app/globals.css`).
- **Rationale**: constitution VII forbids hardcoded hex; reading tokens keeps canvas in the
  same palette pipeline as the DOM. Snapping + no smoothing gives the chunky look for free.
- **Alternatives considered**: hardcoding hex values (violates constitution VII); a
  generated sprite sheet (`npm run gen:assets`) — unnecessary, squares need no asset.

## D3. Leader-change detection: pure function keyed by period

- **Decision**: `lib/client/leader-transition.ts` exports a pure reducer-style function:
  state is `{ periodKey, leaderId } | null`; input is the freshly displayed
  `(periodKey, leaderId | null)`. It returns `{ fire: boolean; next: State }` where `fire`
  is true only when `periodKey` is unchanged AND both leader ids are non-null AND they
  differ. `Podium.tsx` holds the state in a `useRef` and calls the function on each
  rendered rows change.
- **Rationale**: makes FR-001/FR-004 and every edge case (initial load, tab switch,
  re-entry of same leader, empty podium) unit-testable in plain vitest without DOM. The
  period key doubles as the SWR key discriminator already used by `useLeaderboard`.
- **Alternatives considered**: comparing inside an SWR `onSuccess` callback (couples to
  fetch machinery, misses cache-served updates); server-sent "leader changed" flag
  (violates constitution II — derived state stored/pushed; also new API surface for no
  gain at 30 s polling).

## D4. Reduced motion: `useReducedMotion` from motion/react

- **Decision**: gate the *detector's* fire signal with `useReducedMotion()` (already used
  in `AchievementToast.tsx`): when reduced, the transition state still advances but `fire`
  is discarded, so no burst ever mounts (FR-005, SC-004).
- **Rationale**: reusing the existing hook keeps one source of truth for the preference;
  gating at fire time (not draw time) guarantees literally zero celebratory frames.
- **Alternatives considered**: raw `matchMedia` hook (duplicates an existing utility;
  `HintTicker`'s local hook predates the motion one); CSS `@media` hiding the canvas
  (canvas would still draw — wasted work, and "hidden but running" violates FR-006).

## D5. Hidden tab / missed changes: skip, don't replay

- **Decision**: if `document.visibilityState === 'hidden'` when a fire signal occurs, drop
  it (state still advances). No queueing, no replay on return.
- **Rationale**: spec edge case allows skip-or-play-once; skipping is the only option with
  zero bookkeeping and no risk of a stale celebration minutes later. rAF is throttled in
  background tabs anyway, so a "played" burst there would be invisible yet hold resources.
- **Alternatives considered**: replay on `visibilitychange` (requires timestamping and
  staleness rules — complexity without user value on an office tablet that stays visible).

## D6. Overlay placement: fixed, viewport-wide, above content

- **Decision**: the canvas is `position: fixed; inset: 0; pointer-events: none;
  z-index` above page content, `aria-hidden="true"`, rendered by `Podium` only while a
  burst is active; unmounted (not display:none) when finished.
- **Rationale**: FR-002 (never intercepts input, no layout shift) and FR-006 (nothing left
  behind) fall out of pointer-events + unmount. Viewport-wide matches "plays over the
  page" (spec US1) rather than clipping to the podium card. TZ § 6.8 requires exactly
  this shape: absolute/isolated, never replacing markup.
- **Alternatives considered**: portal into `document.body` (unnecessary — fixed positioning
  needs no portal here); absolute inside the podium card (clips the burst, weaker moment).

## D7. Testing strategy

- **Decision**: exhaustive unit tests for `leader-transition.ts` (all spec edge cases as
  table-driven cases). The canvas overlay is validated manually via
  [quickstart.md](./quickstart.md) scenarios; no DOM/component test infra exists in the
  repo (`tests/*.test.ts` run in node env) and adding one for a decorative effect fails
  the cost/benefit test.
- **Rationale**: every acceptance-relevant *decision* (when to fire) is in the pure module;
  the overlay is draw-only. This mirrors how the repo tests `lib/game/*` logic while UI is
  verified on previews.
