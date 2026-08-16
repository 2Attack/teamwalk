# Data Model: First-Place Fireworks

No persistent entities. No database, schema, or DTO changes — the feature consumes the
existing `LeaderboardDto` (`lib/types.ts`) read via `useLeaderboard` and derives everything
on the client, in line with constitution II (derived state is never stored).

## Client-side ephemeral state

### LeaderWatchState (`lib/client/leader-transition.ts`)

Held in a `useRef` inside `Podium`; survives re-renders, dies with the component.

| Field | Type | Meaning |
|---|---|---|
| `periodKey` | `string` | Discriminator of the standings the leader was observed in — the `useLeaderboard` SWR key for the selected period. |
| `leaderId` | `string` | User id of the last *displayed* first-place participant (never null inside a stored state). |

State value is `LeaderWatchState | null`; `null` until the first non-empty standings render.

**Transition function** (pure):

```
observe(prev: LeaderWatchState | null, periodKey: string, leaderId: string | null)
  → { fire: boolean; next: LeaderWatchState | null }
```

Truth table (drives unit tests; spec FR-001/FR-004 + edge cases):

| prev | input | fire | next | Spec anchor |
|---|---|---|---|---|
| `null` | leader B | no | `{key, B}` | FR-004: initial load never fires |
| `{key1, A}` | key2, leader B | no | `{key2, B}` | Edge: tab switch is not a change |
| `{key, A}` | key, leader A | no | `{key, A}` | Scenario 3: refresh without change |
| `{key, A}` | key, leader B | **yes** | `{key, B}` | Scenario 1: leader change |
| `{key, A}` | key, `null` (podium emptied) | no | `null` | Edge: nobody in first place |
| `null` after emptying | key, leader A | no | `{key, A}` | Re-population is a fresh baseline |

Consumers additionally gate `fire` with reduced-motion and document visibility
(research D4, D5) — those are environment concerns, kept out of the pure function.

### FireworksBurst (`components/FireworksOverlay.tsx`)

Internal to the overlay; exists only while a burst plays (≤ 6 s), then the component
unmounts and all of it is garbage.

| Field | Type | Meaning |
|---|---|---|
| `particles` | `Particle[]` | ~80–120 squares; each: position, velocity, color index, size, TTL. |
| `startedAt` | `number` | First rAF timestamp; drives the ≤ 6 s hard cap (SC-002). |
| `palette` | `string[]` | Resolved once per burst from CSS tokens (research D2). |

Trigger contract between `Podium` and the overlay: a monotonically increasing
`burstId: number` state; overlay is rendered only when non-null and reports completion via
callback so `Podium` can unmount it (FR-003: at most one burst per observed change,
new fire during a burst restarts rather than queues).
