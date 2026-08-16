<p align="right"><b>English</b> · <a href="README.ru.md">Русский</a> · <a href="README.es.md">Español</a></p>

<p align="center">
  <img src="docs/screenshots/header.png" alt="TeamWalk — walk together, compete gently, ship steps. An internal office treadmill tracker for teams: no accounts, no auth — built for trust-based teams who just want to walk more." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle + Neon">
  <img src="https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest">
  <img src="https://img.shields.io/badge/license-MIT-a3e635" alt="MIT license">
</p>

Who walked, when and how far — with a leaderboard, streaks, achievements, a shared team route across real cities and a ticker of joke hints generated from live data. Built to the spec in [`TeamWalk_TZ.md`](TeamWalk_TZ.md) (referenced in code as "spec § N"). **No authentication by design**: you pick yourself from a list, and starting a walk takes one tap.

## Features

- **One-tap walks** — pick yourself, pick a speed, get a 3-2-1-GO countdown; live timer, distance, day-record progress and an animated pixel walker.
- **Leaderboard & podium** — week / month / all time; weeks start Monday 00:00 MSK.
- **Streaks with freezes** — workdays only; 2 automatic freezes per month absorb a missed day.
- **20 achievements for character, not volume** — Early Bird, Zen, Marathon and friends.
- **Team route** — everyone's kilometers move the team along a real route ("Yaroslavl → Lisbon").
- **Hint ticker** — game-style phrases assembled by an LLM from anonymized live stats.
- **Telegram bot (opt-in)** — summaries, reminders, "the treadmill is free", Monday digest.
- **Pixel-art UI** — 8bitcn on top of shadcn, always dark, PWA, mobile-first.
- **Three languages** — en / ru / es, one per deployment.

## Tech stack

Next.js 16 (App Router) · TypeScript strict · React 19 · Tailwind CSS 4 · Drizzle ORM ·
Neon Postgres (HTTP driver) · Zod · SWR · Motion · Vercel AI Gateway (AI SDK) · Vitest.

Icons — [pixelarticons](https://pixelarticons.com) (MIT); avatars — DiceBear `pixel-art`. Both are committed at generation time (`npm run gen:assets`) — **no third-party requests at runtime**.

## Quick start

Requires Node.js 20+ and a [Neon](https://neon.tech) Postgres database (or the [cloud-free setup](#cloud-free-local-database) below).

```bash
npm install
cp .env.example .env.local        # put your Neon DATABASE_URL in
npm run db:migrate                # schema + treadmill seed
npm run dev
```

The app is fully functional without LLM credentials (the hint ticker rotates a static catalog) and without a Telegram token (notifications are simply off).

## Deployment

### Vercel (one click)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fattack-it%2Fteamwalk&env=NEXT_PUBLIC_LOCALE,TELEGRAM_ENABLED,TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET,CRON_SECRET&envDescription=UI%20locale%3A%20en%2C%20ru%20or%20es.%20Telegram%3A%20paste%20the%20bot%20token%20from%20%40BotFather%2C%20or%20set%20TELEGRAM_ENABLED%3Dfalse%20and%20put%20%27-%27%20in%20the%20token%20fields.%20TELEGRAM_WEBHOOK_SECRET%20and%20CRON_SECRET%3A%20any%20random%20strings.&envLink=https%3A%2F%2Fgithub.com%2Fattack-it%2Fteamwalk%23readme&project-name=teamwalk&repository-name=teamwalk&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%7D%5D)

The button forks the repo, asks for the variables (locale, optional Telegram bot, cron secret) and provisions a **Neon Postgres** from the Marketplace — `DATABASE_URL` is injected automatically and `buildCommand` runs the migrations. LLM hints work out of the box: on Vercel the AI SDK authenticates via the automatic `VERCEL_OIDC_TOKEN`.

Manual setup is the same three steps: import the repo → attach Neon Postgres from Storage → deploy from `main`. Every other branch gets a preview with its own copy-on-write DB branch (see [Preview deployments](#preview-deployments)).

### Docker (self-hosted)

The app speaks Neon's SQL-over-HTTP protocol, so the stack is app + Postgres + [Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy) — all wired up in [`docker-compose.yml`](docker-compose.yml):

```bash
NEXT_PUBLIC_LOCALE=en docker compose up --build   # en (default), ru or es
```

That's it: Postgres starts with the control-plane table pre-seeded, migrations run on app start, the app listens on <http://localhost:3000>. The locale is inlined at build time — rebuild the image to change it. To enable Telegram or LLM hints, uncomment the corresponding variables in `docker-compose.yml` ([Environment variables](#environment-variables)).

To point the container at a cloud Neon DB instead, run just the app image with your `DATABASE_URL`:

```bash
docker build -t teamwalk --build-arg NEXT_PUBLIC_LOCALE=en .
docker run -p 3000:3000 -e DATABASE_URL=postgres://…neon.tech/… teamwalk
```

## Cloud-free local database

For offline development, run the same "Postgres + Neon HTTP proxy" pair without the app container:

```bash
docker run -d --name cw-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=teamwalk \
  -p 5433:5432 postgres:16-alpine
docker exec -i cw-pg psql -U postgres -d teamwalk < docker/neon-control-plane.sql
docker run -d --name cw-neon-proxy -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@host.docker.internal:5433/teamwalk \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
```

Then put the URL into **`.env.development.local`** — not `.env.local`, which `vercel env pull` overwrites. In dev this file takes priority; `next build` ignores it; delete it to switch back to the cloud DB:

```
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:4444/teamwalk?sslmode=require
```

The `localtest.me` host is the single signal that switches the driver to the local endpoint; that branch never fires in production. Then as usual: `npm run db:migrate` and `npm run dev`.

## Telegram bot in development

Telegram can't reach localhost, so development uses long polling instead of a webhook: `npm run dev:tg` (alongside a running `npm run dev`) starts a grammY bridge that polls updates and forwards them into the regular `/api/telegram/webhook` with the same secret header. The production code path runs in full.

Requires `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in `.env.development.local`. Important: polling **removes the bot's registered webhook** — only ever run the bridge with a separate dev bot from @BotFather, never the production token.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run dev:tg` | Telegram → localhost bridge: long polling instead of a webhook (dev bot only) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` — the primary check |
| `npm test` | Unit tests (Vitest) |
| `npm run db:migrate` | Applies `drizzle/*.sql` in order, idempotent |
| `npm run gen:assets` | Regenerates static assets: avatars, walker sprite, icons |

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres, pooled connection |
| `AI_GATEWAY_API_KEY` | no | Vercel AI Gateway (hints + route drafts); on Vercel deploys the AI SDK falls back to the automatic `VERCEL_OIDC_TOKEN` |
| `AI_GATEWAY_MODEL` | no | Gateway model, default `xai/grok-4.1-fast-non-reasoning` |
| `HINTS_ENABLED` | no | `false` → static phrase catalog only, no LLM calls |
| `TELEGRAM_BOT_TOKEN` | no | Bot from @BotFather; without it the whole Telegram subsystem is off |
| `TELEGRAM_WEBHOOK_SECRET` | no | Webhook secret (`setWebhook … secret_token`) and the local bridge |
| `TELEGRAM_ENABLED` | no | `false` → the bot stays silent, the link panel is hidden |
| `CRON_SECRET` | no | Protects `/api/cron/notify` (Vercel Cron sends it itself) |
| `NOTIFY_WINDOW_START_HOUR` / `NOTIFY_WINDOW_END_HOUR` | no | Daytime window for reminders and the digest, default 11–17 MSK |
| `FREE_WINDOW_START_HOUR` / `FREE_WINDOW_END_HOUR` | no | Window for "treadmill freed up" notifications, default 9–19 MSK |
| `NEXT_PUBLIC_APP_NAME` | no | Name in the header, default `TeamWalk` |
| `NEXT_PUBLIC_LOCALE` | no | Product language: `en` (default), `ru`, `es` |

## Localization

One language per deployment, set by `NEXT_PUBLIC_LOCALE`: UI, API errors, hint catalog, LLM prompts and bot texts. The variable is **inlined into the client bundle at build time** — changing the locale means a redeploy. Dictionaries live in `lib/i18n/messages/{ru,en,es}.ts`; `ru` is the reference and the `Messages` type enforces full key parity.

## Preview deployments

`main` is production, any other branch is a preview:

- Pushing a branch → Vercel builds a preview with a unique URL.
- Neon **preview branching** creates a DB branch `preview/<git-branch>` — an instant copy-on-write clone of production — and injects its `DATABASE_URL` into that deploy only.
- `buildCommand` runs `db:migrate` before every build: each deploy migrates its own DB.

Telegram is off on previews (no bot variables); the notification cron runs in production only — previews rely on the lazy fallback on API access.

## Architecture

- **No state in process memory.** The timer's source of truth is `walks.started_at`; the client computes `Date.now() − startedAt`.
- **The DB owns concurrency.** Two partial unique indexes guarantee one active walk per participant and per treadmill; the API maps `23505` to `409`.
- **The LLM is never on the hot path.** The hint pool is served from `hints_cache` and regenerated in the background; degradation: AI Gateway → previous pool → static catalog.
- **Personal data never leaves the perimeter.** The LLM sees an anonymized snapshot (`u1…uN`); names are substituted on our side.
- **Streaks, records and route position are never stored** — computed from `walks` on the fly.
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

Licensed under the [MIT License](LICENSE).
