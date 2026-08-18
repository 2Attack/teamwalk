# Data Model: Treadmill Busy Telegram Notification

**No schema changes and no migrations.** The feature reads existing tables and writes one new `kind` value into the existing `notification_log` table (its `kind` column is plain text with no CHECK constraint).

## Entities

### Busy transition event (derived, never stored)

The moment the count of free active treadmills drops from ≥1 to 0 because a walk started.

| Attribute | Source | Notes |
|---|---|---|
| Triggering walk | `walks.id` of the just-inserted active walk | Identifies the event; carried into the dedup key |
| Trigger user | `walks.user_id` | Excluded from recipients; owner of the `notification_log` row |
| All-busy state | Computed: count of `treadmills` with `is_active = true` vs distinct `treadmill_id` of `walks` with `status = 'active'` on active treadmills | Same query as `wereAllTreadmillsBusy()`; evaluated after the insert |
| Latest-active check | `walks` with `status = 'active'`, ordered by `started_at` desc, limit 1 | Tie-break: proceed only if the latest active walk is the triggering walk |

### Availability subscriber (derived per event)

| Attribute | Source | Filter |
|---|---|---|
| Chat | `telegram_links.chat_id` | delivery target |
| Subscribed | `telegram_links.notify_free = true` | shared toggle with the freed-up broadcast (FR-003) |
| Not muted | `muted_until IS NULL OR muted_until < now()` | |
| Not the trigger | `user_id != <trigger user>` | |
| Not walking | `NOT EXISTS` active walk for `user_id` | symmetric with `notifyTreadmillFreed` |

## `notification_log` usage (existing table)

| Column | Value |
|---|---|
| `user_id` | trigger user's id (mirrors `freedByUserId` usage for `kind='free'`) |
| `kind` | `'busy'` (new value; existing values: `start`, `finish`, `free`, `autoclose`, remind/digest kinds) |
| `dedup_key` | `busy:<walkId>` — one row per transition, not per recipient |

Idempotency: the existing unique index on the dedup key + `onConflictDoNothing().returning()` pattern (`tryDedup`). Empty `returning` ⇒ another instance already announced ⇒ skip.

## State transitions

```
≥1 active treadmill free
        │  walk insert succeeds on the last free one
        ▼
all active treadmills busy ──► notifyAllTreadmillsBusy (background):
        │                       all-busy? → latest-walk tie-break → window →
        │                       dedup 'busy:<walkId>' → broadcast
        │  any walk finishes/cancels/autocloses (existing flow)
        ▼
≥1 free ──► notifyTreadmillFreed (existing, unchanged)
```

A later re-occupation creates a new triggering walk ⇒ new dedup key ⇒ new announcement (FR-006).
