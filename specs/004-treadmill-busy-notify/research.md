# Research & Design Decisions: Treadmill Busy Telegram Notification

No external unknowns — the feature mirrors an existing, shipped mechanism (`notifyTreadmillFreed` in `lib/telegram/notify.ts`). This document records the design decisions and the alternatives that were rejected.

## D1. When to detect the "all busy" transition

**Decision**: Detect **after** the walk insert, inside the background task. The start route fires `waitUntil(notifyAllTreadmillsBusy({...}))` after a successful insert; the function itself re-reads the DB and proceeds only if *all* active treadmills currently have an active walk (reusing the query in `wereAllTreadmillsBusy()` — the same "count active treadmills vs distinct busy treadmills" check, now evaluated post-occupation).

**Rationale**:
- Zero hot-path cost: `POST /api/walks/start` gains no queries before the response (SC-004, Principle "LLM/side-work off the hot path" analog).
- The freed-up event must check *before* freeing because the transition disappears after the update; the busy event is the opposite — the transition state ("all busy") is durable *after* the insert, so a post-insert read is correct and race-tolerant.

**Alternatives considered**:
- *Pre-insert snapshot* (`active.filter(t => !t.busy).length === 1` from the route's already-fetched list): free — no extra query — but two concurrent starts on the last two treadmills each see 2 free and **neither** announces: the event is silently lost. A missed event is worse than the rare duplicate the post-insert check risks (handled in D2).
- *DB trigger / stored counter*: violates "DB owns state but computed on the fly" idiom; no stored availability state exists today.

## D2. At-most-one broadcast under concurrent starts

**Decision**: Two guards inside `notifyAllTreadmillsBusy`:
1. **Tie-break**: after confirming all-busy, select the most recently started active walk; proceed only if it is the triggering walk (`input.walkId`). When two starts land simultaneously, both background tasks see all-busy, but only the one whose walk is the latest announces.
2. **Dedup**: existing `tryDedup` insert into `notification_log` with `kind='busy'`, `dedupKey='busy:<walkId>'` — protects against replays/retries of the same event (FR-006), same as every other notification kind.

**Rationale**: the tie-break collapses the concurrent-start race deterministically (both tasks resolve the same "latest" walk); the dedup key makes each trigger idempotent. Together: at most one message per transition, and a new transition (free → busy again) gets a fresh walkId → fresh announcement.

**Alternatives considered**:
- *Dedup key per "busy episode"* (e.g. hash of the active walk set): fragile to define, no natural stable identifier; rejected.
- *Accept duplicates*: violates FR-006 and burns subscriber goodwill; rejected — the tie-break costs one indexed query in the background.

## D3. Recipients and subscription category

**Decision**: Identical recipient query to `notifyTreadmillFreed`: `telegram_links` with `notify_free = true`, not muted, excluding the triggering user and anyone with an active walk. No new toggle, no migration.

**Rationale**: spec FR-003/FR-004; busy/free are two directions of one "availability" interest. When all treadmills are busy every walker is excluded by the active-walk filter anyway, but keeping the filter keeps the two functions symmetric and self-explanatory.

## D4. Delivery window and message style

**Decision**: Same window as freed-up: skip weekends (`isWeekend(toOfficeDay(now))`) and hours outside `[FREE_WINDOW_START_HOUR, FREE_WINDOW_END_HOUR)` via `officeHour` from `lib/time.ts`. Dropped events are never rescheduled. Regular (non-silent) message; one shared "PA announcement" text per event for all recipients.

**Rationale**: spec FR-005/FR-008; symmetry with the freed-up contract users already know; Principle VI (time through one module).

## D5. Text content and localization

**Decision**: New `allBusyVariants: readonly string[]` on the `TelegramTexts` interface (`lib/telegram/texts/types.ts`) — a parameterless variant pool — plus an `allBusyText()` builder in `lib/telegram/texts.ts`. Three variants per locale (matching `freeVariants`), phrased count-neutrally (e.g. ru "Свободных дорожек не осталось…") so the same text works for one treadmill or several. Tone contract as documented in `texts/types.ts`: jokes about walking/treadmill/chair/stats only.

**Rationale**: Principle IV — the `TelegramTexts` type enforces en/ru/es parity at compile time; count-neutral phrasing avoids passing treadmill totals and pluralization branches for no user value.

**Alternatives considered**:
- *Include the taken treadmill's name or the walker's name*: the useful signal is "don't go down now", not who took it; naming the walker in a broadcast is a jab the tone contract avoids. Rejected.

## D6. Trigger scope

**Decision**: Only `POST /api/walks/start` triggers the busy check. Cancel/finish/autoclose/webhook paths are untouched (they can only *free* treadmills); administrative treadmill deactivation does not announce (out of scope per spec edge cases).

## D7. Testing approach

**Decision**: Extend `tests/telegram.texts.test.ts` for `allBusyText()` (ru-pinned assertions: non-empty, tone/emoji marker, count-neutral wording, variant pool size parity across locales via the interface). The DB-bound branching in `notifyAllTreadmillsBusy` (window, tie-break, dedup, recipients) follows the same untested-by-unit-tests pattern as `notifyTreadmillFreed` — verified on a preview deploy per `quickstart.md`. No test infrastructure for Neon mocking exists in the repo, and introducing it is out of scope.
