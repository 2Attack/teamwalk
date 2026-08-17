# Data Model: 002-walk-page-back

No database, migration, API or DTO changes. The feature consumes existing
contracts from `lib/types.ts` and introduces one client-side view model.

## Reused entities (unchanged)

### ActiveWalkDto (`lib/types.ts`)

Selected participant's active walk; source for the **resume** card.

| Field | Type | Used by the card |
|---|---|---|
| `id` | string | tap-through target `/walk/[id]` |
| `user` | `UserDto` | name, `avatarId` |
| `treadmillName` | string | subtitle |
| `startedAt` | ISO string | live duration (`Date.now() − startedAt`) |
| `speedKmh` | number | current speed line |

Delivered by `useActiveWalk(userId)` (SWR, already subscribed on home).

### TreadmillBusyDto (`lib/types.ts`)

Busy state of a treadmill; source for the **busy** card.

| Field | Type | Used by the card |
|---|---|---|
| `walkId` | string | tap-through target `/walk/[walkId]` |
| `user` | `Pick<UserDto, 'id' \| 'name' \| 'avatarId'>` | name, avatar |
| `startedAt` | ISO string | live duration |
| `speedKmh` | number | current speed line |

Delivered by `useTreadmills()` (SWR, already subscribed in `StartWalkCard`).
The parent `TreadmillDto.name` supplies `treadmillName` for the busy card.

## New client view model (no persistence)

### WalkInProgressCardProps (`components/WalkInProgressCard.tsx`)

Common projection both DTOs map into:

```
{
  walkId: string
  user: { name: string; avatarId: ... }   // avatarId type as in UserDto
  startedAt: string                        // ISO
  speedKmh: number
  treadmillName?: string
  variant: 'resume' | 'busy'               // emphasis + action wording (D3)
}
```

Mapping:
- `ActiveWalkDto` → `{ walkId: id, user, startedAt, speedKmh, treadmillName, variant: 'resume' }`
- `TreadmillDto` with `busy` → `{ walkId: busy.walkId, user: busy.user, startedAt: busy.startedAt, speedKmh: busy.speedKmh, treadmillName: name, variant: 'busy' }`

### Structured start blocker (`StartWalkCard.tsx`, pure helper)

`startBlocker(...)` return type changes from `string | null` to:

```
| { kind: 'busy'; walks: BusyCardData[] }   // single-busy and all-busy cases; longest walk first
| { kind: 'hint'; text: string }            // "choose a free treadmill"
| null                                      // start allowed
```

State invariants (unchanged, DB-enforced): at most one active walk per
participant and per treadmill; walks close lazily server-side — cards vanish
on the next SWR refresh.
