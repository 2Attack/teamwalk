# Feature Specification: First-Place Fireworks

**Feature Branch**: `001-first-place-fireworks`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "Салют при взятии первого места — отложенный «Слой 3» из ТЗ (spec § 6.8): изолированный canvas-эффект поверх страницы, когда на пьедестале сменяется лидер."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Celebrate a leader change on the podium (Priority: P1)

The team watches the leaderboard on the office tablet or their own devices. When the person
in first place changes — someone's finished walk pushes them past the current leader — the
podium reorders, and a short fireworks burst plays over the screen to mark the moment. The
takeover of first place is the emotional peak of the product (spec § 6.7.6 treats the podium
reshuffle as "the main moment"); today it is only a quiet reordering animation that is easy
to miss.

**Why this priority**: This is the entire feature — a single celebratory moment attached to
the event the product is built around. Everything else is refinement of this story.

**Independent Test**: With two participants close in distance for the visible period, finish
a walk that moves the second participant into first place; every open screen showing the
podium plays the fireworks once as the podium reorders.

**Acceptance Scenarios**:

1. **Given** the podium is visible and participant A is in first place, **When** the
   displayed standings update and participant B is now in first place, **Then** a fireworks
   effect plays once over the page, together with the podium reordering animation.
2. **Given** the fireworks effect is playing, **When** the viewer taps or clicks anywhere,
   **Then** the effect never intercepts the interaction — buttons, tabs and dialogs behind
   it work as if the effect were not there.
3. **Given** the fireworks effect has finished, **When** the standings update again without
   a change of first place, **Then** no effect plays.
4. **Given** a viewer opens the page for the first time (or reloads it), **When** the
   standings first appear, **Then** no fireworks play — only an observed change of leader
   celebrates, not the initial state.

---

### User Story 2 - Respect viewers who opt out of motion (Priority: P2)

A viewer whose system asks for reduced motion (spec § 6.8 hard constraint: reduced motion
silences all animation, including sprites and text effects) must never see the fireworks.

**Why this priority**: An accessibility constraint the product has already committed to;
shipping the effect without it would violate an existing product guarantee. It is P2 only
because it constrains story 1 rather than delivering value on its own.

**Independent Test**: Enable the system reduced-motion preference, trigger a leader change,
and observe that the podium updates without fireworks or any flashing.

**Acceptance Scenarios**:

1. **Given** the viewer's system signals reduced motion, **When** the leader changes,
   **Then** the standings update with no fireworks and no flashing of any kind.

---

### Edge Cases

- Leader changes while the browser tab is hidden or the device is asleep: on return, the
  viewer sees the new standings; playing or skipping the missed celebration are both
  acceptable, but it must play at most once.
- Several standings updates arrive in quick succession (e.g. two walks finish within one
  refresh cycle): at most one celebration plays for the net result; celebrations never
  queue up.
- First place changes on a period tab the viewer is not currently looking at: no
  celebration — only a change visible on the viewer's current tab counts.
- Switching period tabs (Week ↔ All time) shows a different leader: this is not a leader
  change and must not celebrate.
- The same person re-enters first place after a tie or a correction within one refresh:
  a leader change is "displayed first-place person differs from the previously displayed
  one", nothing else.
- The podium empties (no first-place participant displayed): the emptying itself never
  celebrates, and the next occupant of first place establishes a fresh baseline — no
  celebration compares across the gap.
- A viewer's device is a low-powered tablet that stays on this screen for 20–40 minutes:
  the effect must leave no residual work behind after it finishes (no ongoing drawing,
  timers, or battery drain).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST play a celebratory fireworks effect over the page when the
  first-place participant shown on the viewer's current period tab changes from one person
  to another.
- **FR-002**: The effect MUST be purely decorative: it never blocks, delays, or intercepts
  any user interaction, and never shifts page layout.
- **FR-003**: The effect MUST play at most once per observed leader change and MUST end on
  its own within a few seconds (target ≈ 5 s, per spec § 6.8 "an effect of five seconds").
- **FR-004**: The effect MUST NOT play on initial page load, on page reload, or when
  switching period tabs — only on a change observed while the standings are displayed.
- **FR-005**: The effect MUST be fully suppressed when the viewer's system requests
  reduced motion.
- **FR-006**: After the effect finishes, the feature MUST leave no ongoing visual or
  computational activity (relevant for the walk screen left open for tens of minutes on a
  weak tablet — spec § 6.8 hard constraints).
- **FR-007**: The celebration MUST NOT play sound.
- **FR-008**: The visual style of the effect MUST match the product's pixel-art identity
  (chunky particles on the existing palette, not smooth gradient sparks).

### Key Entities

- **Displayed leader**: the participant currently shown in first place for the viewer's
  selected period; exists only on the viewer's screen, never stored. A "leader change" is a
  transition of this value between two consecutively displayed standings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When first place changes hands, 100% of open screens showing the podium play
  the celebration within one standings refresh cycle (≤ 30 s of the walk being saved).
- **SC-002**: The celebration finishes and fully disappears within 6 seconds of starting.
- **SC-003**: Viewers can operate every control (tabs, buttons, dialogs) during the
  celebration with zero missed or delayed interactions.
- **SC-004**: With reduced motion enabled, zero celebratory frames are shown across any
  leader-change scenario.
- **SC-005**: Time to interactive of the app does not measurably regress for users who
  never see a celebration (the effect costs nothing until it plays).

## Assumptions

- The celebration plays for **every viewer** whose screen shows the podium (shared office
  moment), not only for the participant who took first place.
- Scope is the **home screen podium** for the currently selected period tab. A personal
  "you took first place!" celebration on the walk-success screen is out of scope for this
  feature and may become its own spec.
- The parallax background mentioned alongside the fireworks in spec § 6.8 "Layer 3" is
  **out of scope** — this feature covers the fireworks only.
- The existing standings refresh cadence (periodic refresh while the page is open) is
  sufficient for detecting leader changes; this feature adds no new data or server
  behavior.
- Per spec § 6.8, the celebration must not cost "hundreds of kilobytes" of download for a
  five-second effect: the product accepts only a lightweight, self-contained
  implementation, with no heavyweight third-party effect packages.
