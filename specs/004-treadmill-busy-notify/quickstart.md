# Quickstart: Validating the Busy Notification

## Prerequisites

- `npm install` done; `.env.local` with `DATABASE_URL` (or the local `neon-http-proxy` pair in `.env.development.local` — see README).
- Telegram is **off** locally and on previews (no bot vars) — local validation is via tests + logs; end-to-end message delivery is verified in production after merge.

## Automated gates (must pass before merge)

```bash
npm run typecheck                                # primary check; also proves en/ru/es text parity via the TelegramTexts type
npm test                                         # full suite, locale pinned to ru
npx vitest run tests/telegram.texts.test.ts      # focused: allBusyText() assertions
```

Expected: green. The typecheck failing on a locale file means a variant pool was added to fewer than three locales.

## Local behavioral check (no Telegram needed)

1. `npm run dev` against the local DB; seed ≥2 active treadmills.
2. Start walks until the last free treadmill is taken (`POST /api/walks/start` from the UI or curl).
3. Since `telegramEnabled()` is false, the function returns before any DB write: verify **no** `notification_log` rows with `kind = 'busy'` appear, and the start response time is unchanged (background task, contract guarantee 2).
4. Optional deeper check: temporarily set dummy bot vars locally to pass `telegramEnabled()`, repeat step 2, and verify exactly one `notification_log` row `kind='busy'`, `dedup_key='busy:<walkId>'` per transition — including when the same start is replayed. (Message send will fail against the dummy token and be logged + swallowed — that failure path is itself contract guarantee 1.)

## Preview / production verification

1. Push `feature/004-treadmill-busy-notify` → preview deploy (own Neon branch). Behavior on preview: silent no-op (Telegram off) — confirm walk start/finish flows are unaffected.
2. After merge to `main` (production bot live), with a colleague subscribed to availability notifications (`/settings` → free toggle) and not walking:
   - Occupy all but one treadmill, then start a walk on the last one during working hours.
   - Expected: the subscriber gets one "all busy" message; the walker gets none; a second identical transition is not re-announced for the same walk; after a treadmill frees up and is retaken, a fresh message arrives.
3. Off-hours/weekend spot check: same transition → no message then or later.

## References

- Requirements: [spec.md](./spec.md)
- Behavior contract: [contracts/busy-notification.md](./contracts/busy-notification.md)
- Queries and log usage: [data-model.md](./data-model.md)
- Decision log: [research.md](./research.md)
