<p align="right"><b>English</b> · <a href="docs/README.ru.md">Русский</a> · <a href="docs/README.es.md">Español</a></p>

<p align="center">
  <img src="docs/screenshots/header.png" alt="TeamWalk — walk together, compete gently, ship steps. An internal office treadmill tracker for teams: no accounts, no auth — built for trust-based teams who just want to walk more." width="100%">
</p>

<p align="center">
  <a href="https://github.com/attack-it/teamwalk/actions/workflows/ci.yml"><img src="https://github.com/attack-it/teamwalk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://attack-it.github.io/teamwalk/"><img src="https://img.shields.io/badge/landing-live-e8933a" alt="Landing"></a>
  <img src="https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle + Neon">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/attack-it/teamwalk?color=a3e635" alt="License"></a>
</p>

Who walked, when and how far — with a leaderboard, streaks, achievements, a shared team route across real cities and a ticker of joke hints generated from live data. **No authentication by design**: you pick yourself from a list, and starting a walk takes one tap. Take the tour on the [landing page](https://attack-it.github.io/teamwalk/).

## Features

- **One-tap walks** — pick yourself, pick a speed, get a 3-2-1-GO countdown; live timer, distance, day-record progress and an animated pixel walker.
- **Leaderboard & podium** — week / month / all time; weeks start Monday 00:00 MSK.
- **Streaks with freezes** — workdays only; 2 automatic freezes per month absorb a missed day.
- **20 achievements for character, not volume** — Early Bird, Zen, Marathon and friends.
- **Team route** — everyone's kilometers move the team along a real route ("Yaroslavl → Lisbon").
- **Hint ticker** — game-style phrases assembled by an LLM from anonymized live stats.
- **Telegram bot (opt-in)** — summaries, reminders, "the treadmill is free", Monday digest.

## Quick start

Requires Node.js 20+ and a [Neon](https://neon.tech) Postgres database.

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

The button forks the repo, asks for the variables (locale, optional Telegram bot, cron secret) and provisions a **Neon Postgres** from the Marketplace — `DATABASE_URL` is injected automatically and `buildCommand` runs the migrations. If a Telegram token is provided, every production deploy also registers the bot webhook (`scripts/tg-set-webhook.mts`) — no manual `setWebhook` needed. LLM hints work out of the box: on Vercel the AI SDK authenticates via the automatic `VERCEL_OIDC_TOKEN`.

Manual setup is the same three steps: import the repo → attach Neon Postgres from Storage → deploy from `main`. Every other branch gets a preview with its own copy-on-write DB branch.

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

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres, pooled connection |
| `NEXT_PUBLIC_LOCALE` | no | Product language: `en` (default), `ru`, `es`; inlined at build time |
| `TELEGRAM_BOT_TOKEN` | no | Bot from @BotFather; without it the whole Telegram subsystem is off |
| `TELEGRAM_WEBHOOK_SECRET` | no | Webhook secret (`setWebhook … secret_token`) |
| `CRON_SECRET` | no | Protects `/api/cron/notify` (Vercel Cron sends it itself) |
| `ACCESS_PIN` | no | Deployment-wide access PIN: when set, pages and the API require unlocking via `/pin` (cookie lasts ~1 year); empty/unset = open access; changing it logs every device out |

The full list with defaults (LLM hints, notification windows, app name) is documented in [`.env.example`](.env.example).

## Contributing

PRs are welcome. Branch off `main`, make sure `npm run typecheck` and `npm test` pass, and open a pull request — CI runs the same two checks, and every branch gets a preview deploy with its own copy-on-write DB branch.

## Credits

UI kit — [8bitcn/ui](https://8bitcn.com) on top of [shadcn/ui](https://ui.shadcn.com) · icons — [pixelarticons](https://pixelarticons.com) (MIT) · avatars — [DiceBear](https://dicebear.com) `pixel-art` · fonts and sprites generated in-repo.

Licensed under the [MIT License](LICENSE).
