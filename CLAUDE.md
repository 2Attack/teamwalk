# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

TeamWalk — an internal office treadmill walking tracker (Next.js App Router, TypeScript strict, React 19, Tailwind 4, Drizzle + Neon Postgres HTTP driver, Zod, SWR). No authorization by design — the trust model is "our own people".

**Language:** UI texts go only through the `lib/i18n` dictionaries (en/ru/es, see "Localization"). Code comments and commit messages — **English only**; types and names in English. Keep comments **short**: one or two sentences, only a non-obvious constraint or the "why" — no restating the code, no edit history, no obvious explanations.

## Commands

```bash
npm run dev          # dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit — the primary check
npm test             # vitest run (tests/*.test.ts)
npx vitest run tests/streak.test.ts   # a single test file
npm run db:migrate   # applies drizzle/*.sql in order, idempotent
npm run gen:assets   # regenerate static assets: avatars, sprites, icons
```

Requires `DATABASE_URL` (Neon) in `.env.local`. A cloud-free local DB is the "Postgres + neon-http-proxy" docker pair described in the README (including the mandatory `neon_control_plane.endpoints` table); its `DATABASE_URL` goes into `.env.development.local`, and the driver switches to the local endpoint on the `localtest.me` host. LLM credentials are optional: locally `AI_GATEWAY_API_KEY` (Vercel AI Gateway), on Vercel deploys the automatic `VERCEL_OIDC_TOKEN`; without them hints rotate the static catalog.

## Git flow

**Every new feature gets its own branch.** Never commit to `main` directly: `main` is production — a push deploys and migrates the production DB immediately.

1. `git checkout -b feature/<name>` → work → push the branch.
2. Pushing a branch produces a preview deploy with a unique URL and **its own DB branch** (the Neon integration automatically creates `preview/<branch>` — a copy-on-write clone of production — and injects its `DATABASE_URL` into that deploy only). Previews are protected by Vercel Authentication.
3. Never run migrations by hand: `buildCommand` runs `db:migrate` before every deploy build — a preview migrates its own branch, prod migrates its own.
4. Verify on the preview → merge into `main` → push: prod deploys and migrates itself.

Environment quirks: cron (`/api/cron/notify`) runs only in production — previews use the lazy fallback instead; Telegram is off on previews (no bot variables), the production bot lives only on prod.

## Architecture

- **No state in process memory.** The timer's source of truth is `walks.started_at`; the client computes `Date.now() − startedAt`.
- **The DB owns concurrency.** Two partial unique indexes: one active walk per participant and one per treadmill. The API maps error `23505` to `409 WALK_ALREADY_ACTIVE` / `409 TREADMILL_BUSY`.
- **Streaks, records and route position are never stored** — computed from `walks` on the fly.
- **Stale walks** are closed lazily by `lib/walks/autoclose.ts` on API access — no cron (Vercel Hobby plan).
- **The LLM is never on the hot path.** The hint pool lives in `hints_cache`, is served immediately and regenerated in the background (stale-while-revalidate under a single-row mutex). Degradation: AI Gateway (AI SDK, model in `AI_GATEWAY_MODEL`) → previous pool → static catalog. The LLM receives an anonymized snapshot (slots `u1…uN`); names are substituted on our side.
- **Time** — always through `lib/time.ts` (`Europe/Moscow`, "office days" as `YYYY-MM-DD`, workdays without a holiday calendar). Never compute dates by hand.

Layers: `app/api/**` (Route Handlers) → `lib/db/queries/*` (aggregations) and `lib/game/*` (streaks/achievements/progress) → `lib/db/schema.ts`. The client goes only through SWR hooks and `apiSend` from `lib/client/api.ts`. All DTOs are in `lib/types.ts`, Zod schemas in `lib/validation.ts`, constants in `lib/config.ts`.

- **Localization.** The product language is set by `NEXT_PUBLIC_LOCALE` (`en` by default, `ru`, `es`) — one locale per deployment, no UI switcher. The test run is pinned to `ru` in `vitest.config.ts` — content tests assert Russian strings. UI strings go only through `m`/`fmt`/`plural` from `lib/i18n` (dictionaries in `lib/i18n/messages/{ru,en,es}.ts`; `ru` is the reference, the `Messages` type enforces full key parity). The hint catalog (`lib/hints/catalog/*`), LLM prompts and bot texts (`lib/telegram/texts/*`) are per-locale too. Never hardcode new user-facing text — add it to all three dictionaries. The variable is inlined at build time: changing the locale = redeploy.

Use the foundation (`lib/api.ts`, `lib/format.ts`, `lib/time.ts`, `lib/db/*`, etc.) — do not duplicate it.

## API-layer rules

- Route Handlers: `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.
- Errors only through `apiError` / `validationError` / `handle` from `lib/api.ts`.
- In Next 16 `params` is a `Promise`: `{ params }: { params: Promise<{ id: string }> }`.
- Drizzle `numeric` arrives as a **string** — convert with `Number(...)` before returning to the client.
- Responses must match the DTOs in `lib/types.ts` exactly.

## UI

The UI kit is 8bitcn (copy-paste on top of shadcn): `components/ui/8bit/*` wraps the base `components/ui/*` (never edit the base by hand). All the landmines and rules are in `docs/8BITCN.md`; the key ones:

- `font="normal"` for anything people read (names, texts); pixel `retro` only for button labels, numbers, headings, badges.
- The base Tabs are built on **Base UI**, not Radix: the active state is `data-active:`, and it must be duplicated with a `dark:` variant (the theme is always dark).
- Dialogs only through `components/DialogShell.tsx`.
- After `npx shadcn add @8bitcn/<name>`, remove the Google Fonts `@import` that comes back in `components/ui/8bit/styles/retro.css`.
- Palette — tokens from `app/globals.css` (`bg-bg-panel`, `text-text-dim`, `text-citrus`, `text-lime`…), never `bg-[#...]`. Zero border radius, shadows without blur, animate only `transform`/`opacity`, touch targets ≥ 44 px.
- Icons only via `@/components/ui/icon` (pixel 16×16); never `lucide-react`. The 8bitcn `Select` is deliberately not installed.
- Static assets (DiceBear avatars, sprites, `lib/icons.generated.ts`) are script-generated and committed — no third-party requests at runtime; never edit generated files by hand.
