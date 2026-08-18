# Contract: All-Treadmills-Busy Notification

No HTTP API changes — `POST /api/walks/start` request/response DTOs are untouched. The feature's external surface is the Telegram message; its internal surface is one exported function.

## Internal function contract

```ts
// lib/telegram/notify.ts
export async function notifyAllTreadmillsBusy(input: {
  /** The just-inserted active walk that may have taken the last free treadmill. */
  walkId: string;
  /** Its owner — excluded from recipients, owns the notification_log row. */
  startedByUserId: string;
  /** The treadmill the triggering walk occupied — named in the message. */
  treadmillName: string;
}): Promise<void>;
```

**Behavioral guarantees** (mirror `notifyTreadmillFreed` where applicable):

1. Never throws; every failure is `console.error`-logged and swallowed (FR-009).
2. Returns silently when `telegramEnabled()` is false (previews/local).
3. Returns silently outside the delivery window: weekend by `toOfficeDay`, or `officeHour` outside `[FREE_WINDOW_START_HOUR, FREE_WINDOW_END_HOUR)`. Never defers (FR-005).
4. Returns silently unless **all** active treadmills currently have an active walk (FR-001/FR-002); zero active treadmills ⇒ silent.
5. Returns silently unless the triggering walk is the most recently started active walk (concurrent-start tie-break).
6. Sends at most once per `dedupKey = 'busy:<walkId>'` via `notification_log` (FR-006).
7. Recipient set: `notify_free = true`, not muted, `user_id != startedByUserId`, no active walk (FR-003/FR-004).
8. One identical text per event for all recipients, regular (non-silent) delivery (FR-008).

**Caller contract**: `app/api/walks/start/route.ts` invokes it only after a successful walk insert, strictly after the client response, via `waitUntil(...)` — alongside the existing `notifyWalkStarted` call.

## Text contract

```ts
// lib/telegram/texts.ts
export function allBusyText(i: { treadmillName: string }): string; // random pick from the active locale's pool

// lib/telegram/texts/types.ts — on TelegramTexts:
allBusyVariants(i: { treadmillName: string }): readonly string[];
```

- Three variants per locale (en/ru/es), same count in each — parity enforced by the `TelegramTexts` interface.
- Names the treadmill that was just taken (amended 2026-08-18); the rest of the phrasing stays count-neutral. No walker names.
- Tone contract of `texts/types.ts`: walking/treadmill/chair/stats jokes only.
- Suggested marker: 🔴 prefix, mirroring the freed-up 🟢.
