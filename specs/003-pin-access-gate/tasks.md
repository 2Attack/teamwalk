# Tasks: PIN Access Gate

**Input**: Design documents from `/specs/003-pin-access-gate/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pin-gate.md, quickstart.md

**Tests**: Included — the constitution's quality gates (`npm run typecheck`, `npm test`) and the TDD workflow apply; all gate logic is pure functions in `lib/access/pin.ts` designed for vitest.

**Organization**: Grouped by user story. US1 = unlock flow, US2 = outsiders blocked, US3 = opt-in & rotation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 from spec.md

## Phase 1: Setup

**Purpose**: Confirm a green baseline; no scaffolding or dependencies are needed (no new packages, no migrations).

- [x] T001 Run `npm run typecheck && npm test` on branch `003-pin-access-gate` and confirm both pass before any change (baseline for later diffs)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared gate logic and typed contracts every story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Write failing vitest suite in `tests/access.pin.test.ts` covering the `lib/access/pin.ts` contract (see contracts/pin-gate.md §5): `computeAccessToken` is deterministic 64-char hex and differs per PIN (rotation ⇒ new token); `verifyAccessToken` accepts the matching token, rejects wrong/undefined/empty; `constantTimeEqual` handles equal/unequal/different-length inputs; `sanitizeNextPath` accepts `/walk`, `/settings?tab=x`, rejects `//evil.example`, `/\evil`, `https://evil.example`, empty/null → `/`; `isGateEnabled` is false for unset/empty/whitespace `ACCESS_PIN`, true otherwise (use `vi.stubEnv`)
- [x] T003 Implement `lib/access/pin.ts` to make T002 green: `ACCESS_COOKIE_NAME = 'tw_access'`, `ACCESS_COOKIE_MAX_AGE_S = 31_536_000`, `isGateEnabled()`, `computeAccessToken(pin)` (Web Crypto HMAC-SHA256, key = pin, message = `'teamwalk-access-v1'`, hex output), `verifyAccessToken(cookieValue, pin)`, `constantTimeEqual(a, b)` (XOR-fold, length-safe), `sanitizeNextPath(raw)` — pure functions only, no Node-specific imports so the module runs in both proxy and route runtimes
- [x] T004 [P] Add `'PIN_REQUIRED'` and `'PIN_INVALID'` to the `ApiErrorCode` union in `lib/api.ts`
- [x] T005 [P] Add `PinVerifyResponseDto` (`{ ok: true }`) to `lib/types.ts`
- [x] T006 [P] Add `pinVerifySchema` (`{ pin: string }`, trimmed, 1..128) to `lib/validation.ts`
- [x] T007 Add the `pin` section (`title`, `prompt`, `placeholder`, `submit`, `wrongPin`, `required`) to `lib/i18n/messages/ru.ts` (reference), then `en.ts` and `es.ts` — the `Messages` type forces parity; run `npx vitest run tests/i18n.test.ts` to confirm

**Checkpoint**: `npm run typecheck` and `npx vitest run tests/access.pin.test.ts tests/i18n.test.ts` green — user stories can begin.

---

## Phase 3: User Story 1 — Team member unlocks the app once per device (Priority: P1) 🎯 MVP

**Goal**: PIN-enabled deployment shows a pixel-styled `/pin` screen on any page; correct PIN sets the year-long unlock cookie and lands the user on the page they asked for; no re-prompt on revisit.

**Independent Test**: quickstart.md §2 browser flow — fresh incognito profile with `ACCESS_PIN` set: any page → PIN screen → correct PIN → original page; reopen browser → no prompt; wrong PIN → generic localized error.

### Implementation for User Story 1

- [x] T008 [US1] Implement `POST /api/pin` in `app/api/pin/route.ts` per contracts/pin-gate.md §2: `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, wrapped in `handle`; gate off → `apiError(404, 'NOT_FOUND', …)`; parse body with `pinVerifySchema` but map schema failure to the same generic `401 PIN_INVALID` (`m.pin.wrongPin`) as a wrong PIN — never `VALIDATION_ERROR` (no format hints, FR-007); correct PIN (constant-time compare vs `ACCESS_PIN`) → `NextResponse.json({ ok: true })` with the `tw_access` cookie (`httpOnly`, `path=/`, `sameSite=lax`, `maxAge=ACCESS_COOKIE_MAX_AGE_S`, `secure` outside dev) valued `await computeAccessToken(pin)`
- [x] T009 [P] [US1] Create `components/pin/PinGateForm.tsx` (client): 8bit `Card`/`Label`/`Input type="password"`/`Button` from `components/ui/8bit/*`, heading in pixel retro, prompt via `font="normal"`, all strings from `m.pin.*`, palette tokens only, submit button ≥ 44 px; on submit `apiSend('POST', '/api/pin', { pin })`; success → `window.location.assign(sanitizeNextPath(nextParam))`; `ApiError` `PIN_INVALID` → inline `m.pin.wrongPin`, field kept focused for retry
- [x] T010 [US1] Create `app/pin/page.tsx` (server component) per contracts/pin-gate.md §3: read `searchParams` (Promise in Next 16) and `cookies()`; if `!isGateEnabled()` or `await verifyAccessToken(cookie, pin)` → `redirect('/')`; otherwise render `PinGateForm` with the raw `next` param (sanitization happens client-side at navigation)
- [x] T011 [US1] Create root `proxy.ts` (Next 16 convention, `export function proxy`) gating **page** requests per contracts/pin-gate.md §1: `config.matcher` excluding `_next/static`, `_next/image`, `favicon.ico`, `icon.svg`, `apple-icon.png`, `manifest.webmanifest`, `api/cron`, `api/telegram`, `pin`, `api/pin`; gate off or valid `tw_access` cookie → pass through; otherwise non-`/api/` paths → `307` redirect to `/pin?next=<pathname+search>` (leave `/api/*` untouched until T012)
- [x] T012 [US1] Validate quickstart.md §2 browser scenarios end-to-end with `ACCESS_PIN` in `.env.local` (PIN screen on `/` and deep link `/settings`, unlock lands on the requested page, revisit without prompt, wrong PIN generic error) and §5 open-redirect checks (`next=//evil.example` → `/`)

**Checkpoint**: US1 fully functional — a team member can unlock and stay unlocked; outsiders see no pages (API gating lands in US2).

---

## Phase 4: User Story 2 — Outsiders cannot view or corrupt the stats (Priority: P1)

**Goal**: Without a valid unlock, every application API call (read and write) is rejected with a typed 401 and zero data; cron/Telegram automation and static assets stay untouched; nothing ever leaks the PIN.

**Independent Test**: quickstart.md §2 curl block (`/api/users` → `PIN_REQUIRED` 401, `POST /api/walks` → 401 with nothing created, cookie'd request → 200) and §3 exemption checks.

### Implementation for User Story 2

- [x] T013 [US2] Extend `proxy.ts`: requests to `/api/*` without a valid cookie (gate on) → `401` JSON matching `ApiErrorBody` exactly: `{ error: { code: 'PIN_REQUIRED', message: m.pin.required } }` (import `m` from `lib/i18n`); verify the proxy performs no I/O and never echoes the expected token
- [x] T014 [P] [US2] Update `parse()` in `lib/client/api.ts` per contracts/pin-gate.md §4: on `401` + code `PIN_REQUIRED` in a browser context, `window.location.assign('/pin?next=' + encodeURIComponent(location.pathname + location.search))` and return a never-resolving promise so SWR doesn't retry-loop during navigation
- [x] T015 [US2] Validate quickstart.md §2 curl scenarios (401 envelope on reads and writes, 200 with cookie) and §3 exemptions (cron/telegram answer with their own bare 401, not the `PIN_REQUIRED` envelope; `icon.svg` → 200); confirm `/pin` page source contains no team data and `ACCESS_PIN` appears nowhere in `.next/static` client bundles (`grep -r` the built output)

**Checkpoint**: US1 + US2 — stats are unreadable and unmodifiable without the PIN; automation unaffected.

---

## Phase 5: User Story 3 — Protection is optional and off by default (Priority: P2)

**Goal**: Env unset/empty ⇒ app byte-identical to today; setting the PIN activates the gate; rotating it invalidates every remembered device.

**Independent Test**: quickstart.md §1 (gate off: no PIN screen, APIs open, `/api/pin` → 404) and §4 (rotation kills old cookies and old PIN).

### Implementation for User Story 3

- [x] T016 [US3] Verify and, where missing, enforce the off-state passthrough: `proxy.ts` returns early when `!isGateEnabled()`; `/pin` redirects home; `/api/pin` → 404; empty/whitespace `ACCESS_PIN` counts as off — run quickstart.md §1 checks with the var unset and set to `""`
- [x] T017 [US3] Run quickstart.md §4 rotation scenario: change `ACCESS_PIN`, confirm the previously unlocked browser is re-prompted, the old PIN and the old captured `tw_access` value are both rejected
- [x] T018 [P] [US3] Document `ACCESS_PIN` (optional, server-only, empty = gate off, rotation invalidates all devices) in the env/config section of `README.md`, `docs/README.ru.md`, `docs/README.es.md`

**Checkpoint**: All three stories independently validated.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T019 [P] Amend `.specify/memory/constitution.md` Platform Constraints per plan.md Complexity Tracking: trust model becomes "no per-user authorization; an optional deployment-wide access PIN (`ACCESS_PIN`) is permitted", bump version 1.0.0 → 1.1.0 with rationale in the Sync Impact comment
- [x] T020 [P] Update `CLAUDE.md` (Architecture/env notes): mention the optional `ACCESS_PIN` gate, the `tw_access` cookie, and the `proxy.ts` exemption list so future work doesn't route around it
- [x] T021 Full gates: `npm run typecheck`, `npm test` (all suites incl. `i18n.test.ts` parity), `npm run build` (proxy compiles; then re-check `ACCESS_PIN` absent from client bundles)
- [x] T022 Run the complete quickstart.md validation pass top to bottom and tick the expected-outcome table; fix anything that deviates before requesting review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 → Phase 2**: baseline before foundational work.
- **Phase 2 blocks all stories**: T003 (lib/access) is imported by T008/T010/T011/T013/T016; T004–T007 are compile-time prerequisites for the same files.
- **US1 (Phase 3) before US2 (Phase 4)**: T013 extends the `proxy.ts` created in T011; T015's cookie'd-curl check uses T008's endpoint.
- **US3 (Phase 5)**: T016 verifies behavior built in T008–T013; only T018 is fully independent (can run any time after Phase 2).
- **Polish (Phase 6)**: after all stories; T019/T020 can start earlier if desired (documentation only).

### Task-level notes

- T002 before T003 (TDD: red → green).
- T008, T009 are parallel (different files); T010 needs T009 (imports the form); T011 is parallel with T008–T010 (different file, only needs Phase 2).
- T014 is parallel with T013 (different files).

### Parallel Opportunities

```bash
# Phase 2, after T002+T003:
Task: "Add PIN_REQUIRED/PIN_INVALID to ApiErrorCode in lib/api.ts"          # T004
Task: "Add PinVerifyResponseDto to lib/types.ts"                             # T005
Task: "Add pinVerifySchema to lib/validation.ts"                             # T006

# Phase 3:
Task: "Implement POST /api/pin in app/api/pin/route.ts"                      # T008
Task: "Create components/pin/PinGateForm.tsx"                                # T009
Task: "Create root proxy.ts with page gating"                                # T011

# Phase 4:
Task: "Extend proxy.ts with API 401"                                         # T013
Task: "Update parse() in lib/client/api.ts"                                  # T014
```

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: after T012 the deployment already demands a PIN for every page and remembers devices — the visible product exists. US2 (T013–T015) closes the direct-API hole and is required before calling the feature "protects the stats" (both stories are P1; ship them together to production). US3 is mostly verification plus docs — cheap, do it in the same PR. Commit after each task or logical group (`feat:`/`test:`/`docs:` per git-workflow); push the branch for a preview deploy and run quickstart against the preview before merging to `main`.
