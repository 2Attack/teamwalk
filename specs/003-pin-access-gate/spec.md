# Feature Specification: PIN Access Gate

**Feature Branch**: `003-pin-access-gate`

**Created**: 2026-08-17

**Status**: Draft

**Input**: User description: "Нужно сделать в энве новую переменну в которую будет вводится пин для доспупа, если он введен то чтобы попасть на страницу нужо ввести пин, сдеай это в нашем дизайне, чтобы нельзя было ввойти и испортить стату левым людям"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Team member unlocks the app once per device (Priority: P1)

A team member opens the TeamWalk site on a deployment where the access PIN is configured. Instead of the app, they see a PIN entry screen in the product's pixel style. They enter the shared team PIN, get in, and are not asked again on that device on subsequent visits.

**Why this priority**: This is the core of the feature — without the unlock flow the gate would simply lock everyone out, and without the "remember this device" behavior the gate would be too annoying for daily office use.

**Independent Test**: Configure a PIN on a test deployment, open the site in a fresh browser, verify the PIN screen appears, enter the correct PIN, verify the app loads, close and reopen the browser, verify the app loads directly without asking again.

**Acceptance Scenarios**:

1. **Given** a deployment with the access PIN configured and a browser that has never unlocked it, **When** the user opens any page of the app, **Then** they see a PIN entry screen instead of the page content.
2. **Given** the PIN entry screen, **When** the user enters the correct PIN, **Then** they are taken to the page they originally requested and can use the app normally.
3. **Given** a browser that has previously unlocked the app, **When** the user visits again later (including after closing the browser), **Then** the app opens directly with no PIN prompt.
4. **Given** the PIN entry screen, **When** the user enters a wrong PIN, **Then** they see a clear, localized error message and can try again.

---

### User Story 2 - Outsiders cannot view or corrupt the stats (Priority: P1)

Someone who stumbles on the deployment URL but does not know the PIN cannot see the team's data and — critically — cannot start/stop walks, register participants, or otherwise change anything that affects the statistics, whether through the pages or by calling the app's data endpoints directly.

**Why this priority**: Protecting the integrity of the team's stats from strangers is the stated reason for the whole feature. Gating only the visible pages while leaving data endpoints open would not achieve it.

**Independent Test**: On a PIN-enabled deployment, from a browser that has not unlocked: verify every page shows only the PIN screen, and direct requests to the app's data endpoints (reading stats, starting a walk, etc.) are rejected without revealing data.

**Acceptance Scenarios**:

1. **Given** a PIN-enabled deployment and a visitor who has not entered the PIN, **When** they open any page of the app, **Then** no team data (names, walks, leaderboard, stats) is visible.
2. **Given** the same visitor, **When** they send a direct request to any application data endpoint (read or write), **Then** the request is rejected and no data is returned or modified.
3. **Given** a visitor repeatedly guessing PINs, **When** they submit wrong values, **Then** each attempt fails with the same generic error and the correct PIN is never revealed in any response, page source, or client-visible configuration.

---

### User Story 3 - Protection is optional and off by default (Priority: P2)

The person operating the deployment decides whether the gate is active by setting a single configuration value. If the value is not set (or empty), the app behaves exactly as it does today — completely open, zero extra steps for anyone.

**Why this priority**: The team's default trust model is "no authorization"; the gate must be strictly opt-in so existing deployments and previews keep working unchanged.

**Independent Test**: Deploy without the PIN configuration value and verify the app is fully usable with no PIN screen anywhere; set the value and redeploy, verify the gate activates.

**Acceptance Scenarios**:

1. **Given** a deployment where the PIN configuration value is absent or empty, **When** anyone opens any page or calls any endpoint, **Then** behavior is identical to the current open app — no PIN screen, no rejections.
2. **Given** the operator sets the PIN configuration value and redeploys, **When** a fresh browser visits, **Then** the gate is active.
3. **Given** the operator changes the PIN to a new value, **When** a device that unlocked with the old PIN visits again, **Then** it is asked for the PIN again and the old PIN no longer works.

---

### Edge Cases

- PIN configuration value set to an empty string → treated as "protection disabled" (same as absent).
- Operator rotates the PIN → all previously unlocked devices must re-enter; the old PIN grants nothing.
- Automated internal integrations (scheduled maintenance job, Telegram bot webhook) must keep working on a PIN-enabled deployment — they are not browsers and cannot enter a PIN; they keep their existing own protection mechanisms.
- A visitor deep-links directly to an inner page (e.g., a walk screen) → they get the PIN screen first, and after a correct PIN land on the page they asked for.
- The unlocked "remembered" state must not be forgeable: knowing that the gate exists must not allow constructing a valid unlock without knowing the PIN.
- User submits the form with an empty PIN field → same generic "wrong PIN" handling, no hint about PIN length or format.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deployment MUST support a single optional configuration value holding the access PIN. When it is absent or empty, the app MUST behave exactly as today (fully open); when set, the access gate MUST be active for the whole deployment.
- **FR-002**: On a PIN-enabled deployment, any page request from a browser that has not unlocked MUST show a PIN entry screen instead of the page content, with no team data present in what is delivered to the browser.
- **FR-003**: On a PIN-enabled deployment, every application data endpoint (both reads and writes) MUST reject requests that do not carry a valid unlock, returning no team data and performing no changes. Internal automated integrations (scheduled job, bot webhook) are exempt and keep their existing dedicated protections.
- **FR-004**: Entering the correct PIN MUST unlock the app and redirect the user to the page they originally requested.
- **FR-005**: A successful unlock MUST be remembered on that device/browser for a long period (default: one year) so team members are not re-prompted on routine visits.
- **FR-006**: Changing the configured PIN MUST invalidate all previously remembered unlocks; affected devices are simply asked for the PIN again on next visit.
- **FR-007**: An incorrect or empty PIN submission MUST produce a generic, localized error message and allow retry. Responses MUST NOT reveal the correct PIN, its length, or its format.
- **FR-008**: The PIN MUST never be exposed to the client: not in page source, client-visible configuration, error messages, or data responses.
- **FR-009**: The PIN entry screen MUST follow the product's pixel design system (existing palette tokens, zero border radius, pixel typography rules, touch targets ≥ 44 px) and MUST be fully localized in all three product languages (en/ru/es).
- **FR-010**: The remembered unlock MUST be unforgeable — it must not be possible to construct a valid unlock without knowing the current PIN.

### Key Entities

- **Access PIN**: a single shared secret for the whole deployment, defined by the operator in deployment configuration. Not per-user; there are still no user accounts.
- **Unlock grant**: the per-device/browser proof that the PIN was entered correctly. Long-lived, tied to the current PIN value (rotating the PIN voids all grants), and unforgeable without the PIN.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a PIN-enabled deployment, 100% of pages and application data endpoints are inaccessible without a valid unlock — zero team data readable and zero stats modifiable by an outsider.
- **SC-002**: A team member unlocks in under 10 seconds (one field, one submit) and is not prompted again on the same device for at least 30 days of routine use, unless the PIN is rotated.
- **SC-003**: On a deployment without the PIN configured, user experience is byte-for-byte identical to today: no new screens, prompts, or extra steps.
- **SC-004**: After the operator rotates the PIN, 100% of previously unlocked devices are re-prompted and the old PIN is rejected.
- **SC-005**: The existing automated flows (scheduled maintenance, Telegram bot) continue to operate with zero failures attributable to the gate on a PIN-enabled deployment.

## Assumptions

- One shared PIN for the whole team is sufficient; per-user accounts or roles remain out of scope, preserving the product's "no accounts" model. The gate is a perimeter, not an identity system.
- The gate is a deterrent against casual outsiders and accidental link leaks, not a high-security authentication system. No brute-force lockout or attempt throttling in v1 (deployments are already behind non-guessable URLs and platform-level protections; can be added later if needed).
- "Remembered on this device" defaults to approximately one year, or until the PIN is rotated, whichever comes first.
- The scheduled maintenance endpoint and the Telegram bot webhook already have their own dedicated protections and are explicitly outside the PIN gate.
- Preview deployments are already protected by platform-level authentication; the PIN gate primarily targets the production deployment, but works on any deployment where the value is set.
- **Constitution note**: the current constitution (v1.0.0, Platform Constraints) states "no authorization by design — Feature specs MUST NOT introduce auth flows". This feature deliberately extends that trust model at the product owner's request (a shared perimeter PIN, still no user accounts). Per the Governance section, the constitution's Platform Constraints must be amended in the same PR that lands this feature.
