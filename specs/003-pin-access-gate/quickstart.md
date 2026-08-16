# Quickstart: validating the PIN Access Gate

**Feature**: 003-pin-access-gate. Contracts in [contracts/pin-gate.md](./contracts/pin-gate.md), cookie/config shape in [data-model.md](./data-model.md).

## Prerequisites

- `.env.local` with a working `DATABASE_URL` (or the local neon-http-proxy pair from the README).
- Two terminal sessions: one for `npm run dev`, one for `curl`.

## 1. Gate off — zero behavior change (SC-003, US3)

```bash
# Ensure ACCESS_PIN is NOT set in .env.local / .env.development.local
npm run dev
```

- Open `http://localhost:3000` → the app loads directly, no PIN screen.
- `curl -s http://localhost:3000/api/users | head -c 200` → normal JSON, no 401.
- `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/pin -H 'content-type: application/json' -d '{"pin":"x"}'` → `404`.

## 2. Gate on — pages and API locked (US1, US2)

```bash
echo 'ACCESS_PIN=4321' >> .env.local   # restart the dev server after
```

In a **fresh browser profile / incognito window**:

- `http://localhost:3000/` → PIN screen in the pixel design, localized, no team data anywhere in the page source (View Source: no names/stats).
- `http://localhost:3000/settings` → PIN screen; after entering `4321` you land on `/settings` (deep-link preserved).
- Wrong PIN → generic localized error, field ready for retry; response does not hint at length/format.

From the terminal (no cookie):

```bash
curl -s -w '\n%{http_code}\n' http://localhost:3000/api/users              # → PIN_REQUIRED envelope, 401
curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/walks \
  -H 'content-type: application/json' -d '{}'                              # → 401, nothing created
curl -s -w '\n%{http_code}\n' -X POST http://localhost:3000/api/pin \
  -H 'content-type: application/json' -d '{"pin":"wrong"}'                  # → PIN_INVALID envelope, 401
```

With the cookie:

```bash
TOKEN=$(curl -si -X POST http://localhost:3000/api/pin \
  -H 'content-type: application/json' -d '{"pin":"4321"}' \
  | grep -i '^set-cookie:' | sed 's/.*tw_access=\([^;]*\).*/\1/')
curl -s -w '\n%{http_code}\n' --cookie "tw_access=$TOKEN" http://localhost:3000/api/users   # → 200, data
```

## 3. Exemptions keep working (SC-005)

```bash
# Cron: still governed by its own secret, PIN gate must not interfere
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/cron/notify                # → 401 (its own guard, not PIN_REQUIRED)
# Static assets reachable without a cookie
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/icon.svg                       # → 200
```

Verify the cron/telegram 401s are their handlers' bare 401 (empty body), **not** the `PIN_REQUIRED` envelope — that proves the proxy skipped them.

## 4. Rotation invalidates devices (SC-004, US3)

1. Change `.env.local` to `ACCESS_PIN=9999`, restart dev server.
2. Reload the browser that was unlocked with `4321` → PIN screen again; `4321` is rejected, `9999` unlocks.
3. Repeat the `$TOKEN` curl from step 2 with the old token → `401 PIN_REQUIRED`.

## 5. Open-redirect guard

- Visit `http://localhost:3000/pin?next=//evil.example` and unlock → must land on `/`, never on an external host.
- `http://localhost:3000/pin?next=/walk` → lands on `/walk`.

## 6. Automated checks

```bash
npm run typecheck                          # primary gate — must be clean
npx vitest run tests/access.pin.test.ts    # gate unit tests: token determinism, rotation, verify, sanitizeNextPath
npm test                                   # full suite, ru locale — dictionary parity (i18n.test.ts) must stay green
npm run build                              # proxy compiles into the production build
```

## Expected outcome summary

| Check | Expected |
|-------|----------|
| Gate off | app byte-identical to today; `/api/pin` → 404 |
| Gate on, no cookie | every page → `/pin`, every app API → `401 PIN_REQUIRED`, zero data leaked |
| Correct PIN | cookie set, deep-link honored, no re-prompt on revisit |
| Wrong/empty PIN | one generic `PIN_INVALID` message |
| Cron/Telegram/static | untouched by the gate |
| PIN rotation | all old cookies dead |
