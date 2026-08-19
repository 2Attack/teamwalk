# Feature Specification: Per-User Statistics Page

**Feature Branch**: `005-user-stats-page`

**Created**: 2026-08-18

**Status**: Draft

**Input**: User description: "Давай в лидербордах сделаем кнопку на показ статистики, будет открывать по каждому юзеру страница со статистикой, пока сделай блок с чартом https://www.8bitcn.com/docs/blocks/charts/chart-bar где будет указан чарт сколько времени прошел и сколько км за день"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open a teammate's stats from the leaderboard (Priority: P1)

A team member browsing the leaderboard wants to see how a specific person (themselves or a teammate) has been walking day by day. Each leaderboard row gets a stats control; tapping it opens a dedicated statistics page for that person showing a daily bar chart of walked time and distance.

**Why this priority**: This is the whole feature — the navigation entry point plus the first stats block. Without it there is no way to see anyone's daily dynamics; the leaderboard only shows period totals.

**Independent Test**: From the leaderboard, tap the stats control on any row and land on that person's stats page showing their name/avatar and a bar chart with one group of bars per day (time walked and kilometers); a day the person walked shows non-zero bars matching their recorded walks.

**Acceptance Scenarios**:

1. **Given** the leaderboard is displayed with at least one participant, **When** the viewer activates the stats control on a participant's row, **Then** a statistics page for that participant opens, identifying them by name and avatar.
2. **Given** a participant who walked on several recent days, **When** their stats page is viewed, **Then** the chart shows, for each day of the covered period, how much time they walked and how many kilometers — with days they didn't walk shown as zero, not omitted.
3. **Given** the stats page is open, **When** the viewer wants to return, **Then** a back navigation leads to the leaderboard screen.
4. **Given** any participant in the deployment, **When** anyone on the team opens their stats page, **Then** the page is visible — there are no per-user privacy restrictions (shared trust model).

---

### User Story 2 - Readable chart values (Priority: P2)

A viewer looking at the chart needs the exact numbers, not just bar heights: hovering/tapping a day (or reading its labels) reveals the day's walked time and distance in the product's usual formats, and the two metrics are visually distinguishable despite different scales (minutes vs kilometers).

**Why this priority**: Bars without readable values answer "did they walk?" but not "how much?" — the core question the page exists for. Still, the page delivers value even before value affordances are polished, so it follows the P1 skeleton.

**Independent Test**: On a stats page with known walk data, inspect a specific day and read off its exact minutes and kilometers; verify the values match the recorded walks and the two metrics are individually identifiable (legend/labels).

**Acceptance Scenarios**:

1. **Given** a day with recorded walks, **When** the viewer inspects that day on the chart, **Then** the exact walked time and distance for that day are readable and match the recorded totals.
2. **Given** the chart shows both metrics, **When** the viewer looks at the block, **Then** a legend (or equivalent labeling) makes clear which visual element is time and which is distance.

---

### User Story 3 - Sensible empty and edge states (Priority: P3)

A stats page must not break or mislead for newcomers and edge cases: a person with no walks in the covered period sees an explicit "no walks yet" state (not an empty-looking broken chart), and a link to a non-existent person shows the standard not-found handling.

**Why this priority**: Rare paths — most participants have data — but a broken-looking chart for a newcomer undermines trust in the numbers everywhere else.

**Independent Test**: Open the stats page of a participant with zero walks in the period and see a friendly empty state; open a URL with an unknown person identifier and get the standard not-found treatment.

**Acceptance Scenarios**:

1. **Given** a participant with no walks in the covered period, **When** their stats page is viewed, **Then** an explicit empty state is shown in place of (or on top of) the chart block.
2. **Given** a stats URL for an identifier that matches no participant, **When** it is opened, **Then** the standard not-found handling applies.

---

### Edge Cases

- A walk in progress right now: the current day shows only finished walks' totals (an active walk's distance is not final); the day updates once the walk finishes.
- A walk spanning midnight is attributed per the product's existing "office day" attribution rules — the chart must agree with how streaks/leaderboards count that day.
- Very unequal metric scales (e.g. 90 minutes vs 4.5 km): both bars must remain visible and readable — the smaller metric must not be visually crushed to nothing.
- Many zero days in a row for an irregular walker: the chart still renders the full period without layout breakage.
- Narrow phone screens: the daily chart must remain usable (the page is used on phones in the office).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every participant row in the leaderboard MUST offer a stats control that opens that participant's statistics page.
- **FR-002**: The statistics page MUST identify the participant (name, avatar) and provide back navigation to the leaderboard.
- **FR-003**: The page MUST contain a daily bar-chart block covering the last 30 calendar days including today, with one entry per day.
- **FR-004**: For each day the chart MUST present two metrics computed from the participant's finished walks: total walked time and total distance (km), attributed to days by the product's existing day-attribution rules.
- **FR-005**: Days without walks MUST appear as zero values, not be omitted, so the time axis is continuous.
- **FR-006**: Exact per-day values MUST be readable (via inspection/labels) in the product's standard time and distance formats.
- **FR-007**: A participant with no walks in the covered period MUST see an explicit localized empty state; an unknown participant identifier MUST produce the standard not-found handling.
- **FR-008**: The page MUST be reachable by anyone using the deployment (subject only to the existing deployment-wide access gate, if enabled); no per-user permissions.
- **FR-009**: All texts of the page and chart block MUST exist in all three product locales.
- **FR-010**: Daily aggregates MUST always reflect the current recorded walks (computed on demand, consistent with how the leaderboard computes totals) — no separately maintained copies that can drift.

### Key Entities

- **Daily stat entry**: one day for one participant — date, total walked time, total distance; derived from finished walks, never stored.
- **Statistics page**: per-participant view; in this iteration contains the identity header and one daily chart block, structured so more blocks can be added later.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the leaderboard, a viewer reaches any participant's stats page in one interaction.
- **SC-002**: For every day in the covered period, the chart's time and distance values exactly match the participant's recorded finished walks for that day (spot-checked against walk history).
- **SC-003**: The chart renders correctly for the full range of realistic data: 0 walks, 1 walk, and multi-walk days, on both desktop and phone screens.
- **SC-004**: The stats page becomes visible within the product's usual page-load feel (no noticeably slower than the leaderboard itself).

## Assumptions

- "Кнопка на показ статистики" is a per-row control on the leaderboard (icon-button style consistent with the pixel UI), not a single global button.
- The chart period is fixed at the **last 30 calendar days including today** for this iteration; period selection on the stats page (mirroring leaderboard tabs) is a possible follow-up, out of scope now.
- Both metrics live in **one** chart block (grouped/dual presentation resolved at design time); the referenced pixel-styled bar-chart block from the product's UI kit is the intended visual direction — exact composition is an implementation choice.
- Only **finished** walks count (consistent with leaderboard totals); an active walk contributes after it ends.
- Day attribution and timezone follow the product's existing office-day rules — the chart must never disagree with streak/leaderboard day math.
- The page is open to everyone in the deployment per the product's trust model; the optional deployment-wide PIN gate applies as it does to every other page.
- This iteration ships exactly one block; the page layout anticipates future blocks (records, streaks, achievements) without committing to them.
