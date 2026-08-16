# UI & Navigation Contract: 002-walk-page-back

No API endpoints are added, changed or removed. This contract fixes the
client-side behavior other parts of the app (and the amended TZ) rely on.

## Navigation contract

| From | Trigger | To | Method | Notes |
|---|---|---|---|---|
| `/` | page load / SWR poll finds active walk | — | **none** | Passive redirect is removed (FR-001). URL stays `/`. |
| `/` | resume card primary action | `/walk/[id]` | `router.push` | id from `ActiveWalkDto.id` |
| `/` | busy card tap | `/walk/[walkId]` | `router.push` | id from `TreadmillBusyDto.walkId` |
| `/` | start flow (countdown → POST ok) | `/walk/[id]` | `router.push` after prime+prefetch+dwell | unchanged (D1) |
| `/` | "Start" pressed, 409 `WALK_ALREADY_ACTIVE` | `/walk/[id]` | `router.replace` | unchanged — explicit intent |
| `/walk/[id]` | back button (top) | `/` | `router.push` | walk state untouched; browser Back returns to the walk (D5) |
| `/walk/[id]` | walk gone (finished/cancelled elsewhere) | `/` | `router.replace` | unchanged existing behavior |

## Component contract

### `WalkInProgressCard` (new, `components/WalkInProgressCard.tsx`)

- Built on the 8bitcn `Card`/`CardContent` (user request during implementation), compact `[--card-spacing:0.75rem]`.
- Props: see [data-model.md](../data-model.md); pure presentational + `router.push` on action.
- Renders: `Avatar` (existing component), name (`font="normal"`), treadmill name, live duration (`elapsedSec` + `formatDuration`, ticks 1 s via `useNowTick` only while mounted with an active walk), current speed.
- `variant="resume"`: prominent primary action button (pixel font label, `min-h-11`+).
- `variant="busy"`: whole card tappable (role/link semantics, ≥ 44 px), secondary emphasis.
- All strings via `m.walkCard.*` / `fmt` — en/ru/es parity.

### `StartWalkCard` (changed)

- New prop: `activeWalk: ActiveWalkDto | null` (single subscription stays in `app/page.tsx`).
- `activeWalk !== null` → renders `UserSelect` + `WalkInProgressCard variant="resume"`; treadmill picker, speed picker and start button are not rendered.
- `startBlocker` returns the structured result (data-model.md); `kind: 'busy'` renders `WalkInProgressCard variant="busy"` per walk (longest first), `kind: 'hint'` renders the existing text row.

### `app/walk/[id]/page.tsx` (changed)

- Back control at top of `<main>`, before the start line; same pattern as the settings screen (user request during implementation): `next/link` `Link href="/"` with `font-pixel` dim styling and the shared `m.settings.backHome` label («← На главную»), `min-h-11`.

## i18n contract (keys, all three dictionaries)

Added:
- ~~`walk.backHome`~~ — dropped: the back link reuses the existing `settings.backHome` («← На главную») for pixel-perfect parity with the settings screen.
- `walkCard.inProgressTitle` — resume-card title (e.g. «Прогулка идёт»).
- `walkCard.openWalk` — resume action label.
- `walkCard.busyTitle` — busy-cards zone caption (replaces `blockerAllBusy` sentence role where needed; exact ru wording decided at implementation, asserted by ru-pinned tests).
- `walkCard.elapsed` / `walkCard.speed` — value labels if the layout needs them (`fmt` placeholders).

Removed (from ru, en, es simultaneously): `startCard.blockerSingleBusy`, `startCard.blockerAllBusyTail`; `startCard.blockerAllBusy` kept only if reused as the busy-zone caption, otherwise removed. `treadmillPicker.busyLabel` stays (still used inside the picker grid).

## Icon contract

- `scripts/gen-icons.mjs` MAP gains `arrowRight: 'arrow-right'` (tap-through affordance on the busy card); `lib/icons.generated.ts` regenerated via `npm run gen:icons` and committed. No hand edits. (`arrowLeft` was added then dropped — the back control became a text link with the arrow char in the string, as on settings.)

## TZ amendment contract (same PR)

- § 6.3: the auto-open-on-home bullet is replaced with: home shows an active-walk card for the selected participant (open action → walk screen); walk screen has a top back control returning home without ending the walk.
- § 6.1 landing note: the "auto-redirect race" justification for pausing the home subscription during the start flow is rewritten as "prevents the start card from swapping to the in-progress card under the countdown overlay".
