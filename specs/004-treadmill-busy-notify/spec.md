# Feature Specification: Treadmill Busy Telegram Notification

**Feature Branch**: `004-treadmill-busy-notify`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "нужно добавить уведомление в телеграм тем кто подписан, что дорожка занята, щас сообщение есть только если дорожка освободилась"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know when it's pointless to go down (Priority: P1)

An office worker subscribed to treadmill availability notifications is at their desk planning to take a walk soon. When the last free treadmill gets taken, they receive a Telegram message that all treadmills are now busy — so they don't waste a trip to the treadmill room and can wait for the existing "treadmill freed up" message instead.

**Why this priority**: This is the entire feature. Today subscribers learn only when a treadmill frees up; they have no signal for the opposite transition, so they walk over to an occupied room or keep guessing.

**Independent Test**: With two colleagues walking on the only two active treadmills, a subscriber who is not walking receives exactly one "all treadmills busy" message at the moment the second (last free) treadmill is taken.

**Acceptance Scenarios**:

1. **Given** at least one treadmill is free and a user is subscribed to availability notifications, **When** the last free treadmill becomes occupied (a walk starts on it) during working hours on a workday, **Then** the subscriber receives one Telegram message saying the treadmills are all busy.
2. **Given** several treadmills are free, **When** a walk starts on one of them (at least one other remains free), **Then** no busy notification is sent to anyone.
3. **Given** all treadmills just became busy, **When** the busy notification is dispatched, **Then** the person whose walk triggered the transition and anyone currently walking do not receive it.
4. **Given** a user has muted the bot or turned off availability notifications, **When** the busy transition happens, **Then** that user receives nothing.

---

### User Story 2 - No noise outside working hours (Priority: P2)

A subscriber does not want busy/free chatter in the evening or on weekends. Busy notifications follow the same quiet rules as the existing "treadmill freed up" message: outside the working window or on weekends nothing is sent, and the missed event is not delivered later — it expires instantly.

**Why this priority**: The freed-up notification already established this contract; breaking symmetry would make the bot feel spammy and erode trust in the whole notification category.

**Independent Test**: Trigger the "last treadmill taken" transition outside the working window; verify no message is sent then or later.

**Acceptance Scenarios**:

1. **Given** the last free treadmill is taken outside the working notification window or on a weekend, **When** the transition happens, **Then** no busy notification is sent, and none is queued for later delivery.

---

### User Story 3 - Exactly one message per busy episode (Priority: P2)

Treadmill turnover can be quick: busy → free → busy again within minutes. Each "became fully busy" transition is announced at most once, even if the system processes the event more than once (retries, concurrent requests). A new busy episode after a treadmill freed up is a new event and is announced again.

**Why this priority**: Duplicate broadcasts to the whole subscriber list are the fastest way to get everyone to unsubscribe; correctness of the once-per-event guarantee protects the feature's value.

**Independent Test**: Simulate a duplicate processing of the same walk-start event; verify subscribers get one message. Then free a treadmill and occupy it again; verify a second (new) busy message is sent.

**Acceptance Scenarios**:

1. **Given** a busy transition was already announced, **When** the same triggering event is processed again, **Then** no duplicate message is sent.
2. **Given** a busy notification was sent, **When** a treadmill later frees up and is then taken again (a new all-busy transition), **Then** a new busy notification is sent for the new episode.

---

### Edge Cases

- A walk starts and is cancelled seconds later ("prank protection" cancel): the busy message may already have been sent — acceptable, since the subsequent free transition produces its own "freed up" message.
- All treadmills are already busy when a user subscribes: no retroactive notification.
- Delivery to one recipient fails: remaining recipients still receive the message; the failure is logged and never surfaces as an application error.
- Telegram integration is disabled (no bot configured, e.g. preview deployments): the feature is silently inactive, walk start/finish flows are unaffected.
- The all-busy state arises from an administrator deactivating a free treadmill rather than from a walk starting: out of scope — only walk-start transitions announce busyness.
- Zero active treadmills configured: no notifications of either kind.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST send a Telegram broadcast to availability subscribers when the last free active treadmill becomes occupied by a starting walk (transition "at least one free → all busy").
- **FR-002**: The system MUST NOT send any busy notification when a walk starts while at least one other active treadmill remains free.
- **FR-003**: Recipients are the users subscribed to the existing treadmill availability ("freed up") notification category; no separate subscription toggle is introduced.
- **FR-004**: The system MUST exclude from the broadcast: the user whose walk triggered the transition, any user currently walking, and any user who muted the bot.
- **FR-005**: The system MUST apply the same delivery window as the "treadmill freed up" notification (workdays, working hours); an event outside the window is dropped, never deferred.
- **FR-006**: The system MUST deliver at most one broadcast per all-busy transition, including under concurrent or repeated processing of the triggering event; a subsequent new transition is announced anew.
- **FR-007**: The notification text MUST exist in all three product locales (en/ru/es) and follow the established bot tone (jokes about walking/treadmills/stats only), with the same number of phrasing variants per locale.
- **FR-008**: Every recipient of one event MUST receive the same text (a "PA announcement", consistent with the freed-up message).
- **FR-009**: Notification failures MUST never affect the walk start flow: errors are logged server-side and swallowed.

### Key Entities

- **Busy transition event**: the moment the count of free active treadmills drops from ≥1 to 0 because a walk started; identified by the triggering walk.
- **Availability subscriber**: a user with a linked Telegram chat and the availability notification category enabled, not muted, not currently walking.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When the last free treadmill is taken during the delivery window, every eligible subscriber receives the busy message within 1 minute of the walk starting.
- **SC-002**: 100% of busy events produce at most one message per subscriber (zero duplicates under retries or concurrent starts).
- **SC-003**: Zero busy notifications are delivered outside the working window, to walkers, to muted users, or to users who disabled the availability category.
- **SC-004**: Walk start latency and success rate observed by the walker are unchanged whether or not the notification is sent (notification is fully background).

## Assumptions

- "Дорожка занята" is interpreted as the transition to **all** active treadmills being busy — the mirror of the existing "all busy → one free" freed-up broadcast — not a message on every walk start, which would notify the whole office on every single walk.
- The existing availability subscription (the "freed up" toggle) covers both directions; subscribers who want to know when a treadmill frees up also want to know when the last one is taken. No new settings toggle, no migration of user preferences.
- The same working-hours window used for the freed-up message applies; no new schedule configuration is introduced.
- The busy message is a regular (non-silent) message, matching the freed-up message's delivery style.
- Only walk starts trigger the event; administrative changes to the treadmill list do not.
