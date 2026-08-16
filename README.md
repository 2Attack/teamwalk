<p align="right"><b>English</b> · <a href="README.ru.md">Русский</a> · <a href="README.es.md">Español</a></p>

# TeamWalk

**An internal tracker for the office walking pad: who walked, when and how far — with a leaderboard, streaks, achievements, a shared team route across real cities and a ticker of joke hints generated from live data.**

![Next.js](https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS 4](https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black)
![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white)

<p align="center">
  <img src="docs/screenshots/home.png" alt="Home: team route, start-a-walk card, podium and leaderboard" width="68%">
  <img src="docs/screenshots/walk.png" alt="Active walk: timer, distance, pixel walker, speed control and a hint" width="29%">
</p>

Built to the spec in [`TeamWalk_TZ.md`](TeamWalk_TZ.md) (code and docs reference its sections as "spec § N"). There is **no authentication by design** — the trust model is "our own people": you pick yourself from a list, and starting a walk takes one tap.

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Cloud-free local database](#cloud-free-local-database)
- [Telegram bot in development](#telegram-bot-in-development)
- [Scripts](#scripts)
- [Environment variables](#environment-variables)
- [Localization](#localization)
- [Preview deployments](#preview-deployments)
- [Deploying to Vercel](#deploying-to-vercel)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Credits](#credits)

## Features

- **One-tap walks.** Pick yourself, pick a speed (a row of big buttons, your last choice pre-selected), get a 3-2-1-GO countdown. The active screen shows a `HH:MM:SS` timer, a running distance estimate, your personal day record with progress, mid-walk speed changes and an animated pixel walker. The finish dialog pre-fills the distance from speed × time — the treadmill display stays the source of truth.
- **Leaderboard & podium.** Top-3 podium and a full table (distance, walks, streak, actual average speed) for the week, month or all time. Weeks start Monday 00:00 Moscow time.
- **Streaks with freezes.** Consecutive workdays with at least one walk; weekends neither break nor extend a streak, and 2 automatic freezes per month absorb a missed day — one sick day doesn't kill months of effort.
- **20 achievements for character, not volume** — Early Bird, Night Owl, Zen (30 min at ≤2 km/h), Marathon, Cruise Control and friends — so the leader doesn't sweep them all.
- **Team route.** Everyone's kilometers add up and move the team along a real route ("Yaroslavl → Lisbon"). Routes are managed in a catalog with exactly one active; a new route can be drafted by an LLM from a text prompt — always as a human-reviewed draft, never written to the DB directly.
- **Hint ticker.** Game-loading-screen-style phrases teasing actual participants, assembled by an LLM from an anonymized snapshot of real stats. Jokes are about walking, the treadmill and the numbers — never about anyone's body, weight or health.
- **Telegram bot (opt-in).** Walk summaries, achievements, "time to stretch" reminders, "the treadmill is free", and a Monday digest — with per-category toggles, `/mute`, and one-command unsubscribe. Linking via QR code rendered client-side.
- **Multiple treadmills.** The picker appears automatically once a second active treadmill exists; the DB guarantees one active walk per treadmill and per participant.
- **Pixel-art UI** (8bitcn on top of shadcn), always dark, PWA-installable, mobile-first — the phone next to the treadmill is the primary device.
- **Three languages** — English, Russian, Spanish — one per deployment (see [Localization](#localization)).

## Tech stack

Next.js 16 (App Router) · TypeScript strict · React 19 · Tailwind CSS 4 · Drizzle ORM ·
Neon Postgres (HTTP driver) · Zod · SWR · Motion · Vercel AI Gateway (AI SDK) · Vitest.

Icons — [pixelarticons](https://pixelarticons.com) (MIT); avatars — DiceBear `pixel-art`. Both are committed at generation time (`npm run gen:assets`); there are **no third-party requests at runtime**.

## Quick start

Requires Node.js 20+ and a [Neon](https://neon.tech) Postgres database (or the cloud-free setup below).

```bash
npm install
cp .env.example .env.local        # put your Neon DATABASE_URL in
npm run db:migrate                # schema + treadmill seed
npm run dev
```

The seed matters: without a row in `treadmills` a walk cannot be started — the migration creates one automatically.

The app is fully functional without LLM credentials (the hint ticker rotates a static catalog) and without a Telegram token (notifications are simply off).

## Cloud-free local database

Neon serves SQL over HTTP, so a plain Postgres won't work directly. For offline work, run a "Postgres + Neon HTTP proxy" pair:

```bash
docker run -d --name cw-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=teamwalk \
  -p 5433:5432 postgres:16-alpine
docker run -d --name cw-neon-proxy -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@host.docker.internal:5433/teamwalk \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
```

Recent proxy versions ask a "control plane" for the allowed-IP list before every request and answer `500 Control plane request failed` without it. Create the table once by hand; `db` is the endpoint name, i.e. the first label of the host `db.localtest.me`:

```bash
docker exec -i cw-pg psql -U postgres -d teamwalk <<'SQL'
create schema if not exists neon_control_plane;
create table if not exists neon_control_plane.endpoints (
  endpoint_id varchar(255) primary key,
  allowed_ips varchar(255)
);
insert into neon_control_plane.endpoints (endpoint_id, allowed_ips)
values ('db', '0.0.0.0/0') on conflict (endpoint_id) do nothing;
SQL
```

Then put the URL into **`.env.development.local`** — not `.env.local`, which `vercel env pull` overwrites, and production credentials are better left alone. In dev this file takes priority; `next build` with `NODE_ENV=production` ignores it; delete it to switch back to the cloud DB:

```
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:4444/teamwalk?sslmode=require
```

The `localtest.me` host is the single signal that switches the driver to the local endpoint; that branch never fires in production. Then as usual: `npm run db:migrate` and `npm run dev`.

## Telegram bot in development

Telegram can't reach localhost, so development uses long polling instead of a webhook: `npm run dev:tg` (alongside a running `npm run dev`) starts a grammY bridge that polls updates and forwards them into the regular `/api/telegram/webhook` with the same secret header. The production code path runs in full — secret check, deduplication, all bot logic.

Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in `.env.development.local` (or `.env.local`). Important: polling **removes the bot's registered webhook**, so only ever run the bridge with a dev bot — create a separate one via @BotFather, never use the production token.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run dev:tg` | Telegram → localhost bridge: long polling instead of a webhook (dev bot only) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` — the primary check |
| `npm test` | Unit tests (Vitest: streaks, distance, hints post-filter, validation, bot texts) |
| `npm run db:migrate` | Applies `drizzle/*.sql` in order, idempotent |
| `npm run gen:assets` | Regenerates static assets: avatars (DiceBear `pixel-art`), walker sprite, icons |
| `npm run gen:icons` | Icons only: `lib/icons.generated.ts` from the `pixelarticons` package |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres, pooled connection |
| `AI_GATEWAY_API_KEY` | no | Vercel AI Gateway — the only LLM provider (hints + route drafts); on Vercel deploys the AI SDK falls back to the automatic `VERCEL_OIDC_TOKEN` |
| `AI_GATEWAY_MODEL` | no | Gateway model, default `xai/grok-4.1-fast-non-reasoning` |
| `HINTS_ENABLED` | no | `false` → static phrase catalog only, no LLM calls |
| `HINTS_TTL_MINUTES` | no | Hint pool regeneration period, default 60 |
| `HINTS_POOL_MAX` | no | Hints per pool, default 24 |
| `TELEGRAM_BOT_TOKEN` | no | Bot from @BotFather; without it the whole Telegram subsystem is off (spec § 6.10) |
| `TELEGRAM_WEBHOOK_SECRET` | no | Webhook secret (`setWebhook … secret_token`) and the local bridge |
| `TELEGRAM_ENABLED` | no | `false` → the bot stays silent, the link panel is hidden |
| `CRON_SECRET` | no | Protects `/api/cron/notify` (Vercel Cron sends it itself) |
| `NOTIFY_WINDOW_START_HOUR` / `NOTIFY_WINDOW_END_HOUR` | no | Daytime window for reminders and the digest, default 11–17 MSK |
| `FREE_WINDOW_START_HOUR` / `FREE_WINDOW_END_HOUR` | no | Window for "treadmill freed up" notifications, default 9–19 MSK |
| `NEXT_PUBLIC_APP_NAME` | no | Name in the header, default `TeamWalk` |
| `NEXT_PUBLIC_LOCALE` | no | Product language: `en` (default), `ru`, `es` — see [Localization](#localization) |

## Localization

The whole product ships in one language per deployment, set by `NEXT_PUBLIC_LOCALE`: UI, API error messages, the hint catalog, LLM prompts and Telegram bot texts. There is no in-app switcher. The variable is **inlined into the client bundle at build time** — changing the locale means a redeploy.

Dictionaries live in `lib/i18n/messages/{ru,en,es}.ts`; `ru` is the reference and the `Messages` type enforces full key parity. The test run is pinned to `ru` (`vitest.config.ts`) because content tests assert Russian strings.

## Preview deployments

The model is simple: `main` is production, any other branch is a preview.

- Pushing a branch → Vercel builds a preview deploy with a unique URL.
- The Neon integration has **preview branching** enabled: for every preview deploy Neon creates a DB branch `preview/<git-branch>` — an instant copy-on-write clone of production — and injects its `DATABASE_URL` into that deploy only. Previews never see the production DB; the DB branch is deleted along with the preview per Vercel's retention policy.
- `buildCommand` in `vercel.json` runs `db:migrate` before every build: each deploy migrates its own DB — prod its own, previews their branch. The scripts are idempotent; re-runs are safe.

```bash
git checkout -b feature/x && git push -u origin feature/x  # preview with its own DB
git checkout main && git merge feature/x && git push       # prod: deploy + migrations run themselves
```

Telegram is off on previews (no bot variables — the subsystem turns itself off); `@teamwalk_staging_bot` is for local development via `npm run dev:tg`. The notification cron (`/api/cron/notify`, daily at 08:00 UTC per `vercel.json`) runs **in production only** — previews rely on the lazy fallback that runs on API access.

## Deploying to Vercel

1. Repository on GitHub → import into Vercel.
2. **Storage → Neon Postgres** (Marketplace): the variables are injected automatically.
3. No file storage needed — avatars live in the repo and are served from the CDN. DiceBear draws them only during `npm run gen:assets`: at runtime there are no calls to `api.dicebear.com`, otherwise one leaderboard page would fire a dozen third-party requests and the app would lose its avatars offline.
4. LLM: enable AI Gateway in the project settings — on deploys the AI SDK authenticates itself via `VERCEL_OIDC_TOKEN`; locally you need an `AI_GATEWAY_API_KEY` (Dashboard → AI Gateway → API Keys). Without credentials the hints rotate the static catalog.
5. Deploy from `main`; every other branch gets a preview.

Stale walks don't need a cron: they are auto-closed by a lazy check on API access (spec § 7.6). The only scheduled job is the daily notification sweep.

## Architecture

- **No state in process memory.** The timer's source of truth is `walks.started_at`; the client computes `Date.now() − startedAt`, so a page reload, a sleeping device or switching devices never breaks the clock.
- **The DB owns concurrency, not the code.** Two partial unique indexes guarantee one active walk per participant and one per treadmill; the API maps `23505` to `409 WALK_ALREADY_ACTIVE` / `409 TREADMILL_BUSY`.
- **The LLM is never on the hot path.** The hint pool lives in `hints_cache`, is served immediately and regenerated in the background (stale-while-revalidate under a single-row mutex). Degradation chain: AI Gateway → previous pool → static catalog.
- **Personal data never leaves the perimeter.** The LLM receives an anonymized snapshot with slots `u1…uN`; real names are substituted on our side.
- **Streaks, records and route position are never stored** — computed from `walks` on the fly, so deleting a walk recalculates everything by itself.
- **Time only through `lib/time.ts`** (`Europe/Moscow`, "office days" as `YYYY-MM-DD`).

## Project structure

```
app/            pages and Route Handlers (26 API endpoints)
components/     UI: pixel kit (components/ui/8bit), podium, leaderboard, hint ticker
lib/db/         Drizzle schema, Neon client, aggregations
lib/hints/      snapshot, prompt, providers, post-filter, cache, per-locale catalog
lib/game/       streaks with freezes, achievements, team progress
lib/telegram/   notifications, per-locale bot texts, webhook logic
lib/i18n/       dictionaries en/ru/es, fmt/plural helpers
drizzle/        DDL migrations
docs/CONTRACT.md   zone boundaries and cross-module signatures
docs/8BITCN.md     UI-kit rules and landmines
```

## Credits

UI kit — [8bitcn/ui](https://8bitcn.com) on top of [shadcn/ui](https://ui.shadcn.com) · icons — [pixelarticons](https://pixelarticons.com) (MIT) · avatars — [DiceBear](https://dicebear.com) `pixel-art` · fonts and sprites generated in-repo.

Internal project — no license, all rights reserved.
