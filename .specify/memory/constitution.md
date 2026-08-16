<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Modified principles: n/a (initial ratification)
- Added sections: Core Principles (I–VII), Platform Constraints, Development Workflow, Governance
- Removed sections: none
- Follow-up TODOs: none
- Source of derived principles: CLAUDE.md, TeamWalk_TZ.md, docs/CONTRACT.md, docs/8BITCN.md
-->

# TeamWalk Constitution

## Core Principles

### I. Spec Is the Source of Truth

`TeamWalk_TZ.md` is the product specification. Every behavioral requirement traces back to a
section of it (code and docs reference them as "spec § N.N"). Feature specs created under
`specs/` MUST NOT contradict it; when they extend it, the extension is explicit. Streaks,
records, achievements and route progress follow the spec's formulas exactly — no invented
game mechanics.

### II. Stateless Server, Database Owns State

No state lives in process memory. The timer's source of truth is `walks.started_at`; clients
derive elapsed time from it. Concurrency is enforced by the database (partial unique indexes:
one active walk per participant, one per treadmill), and unique-violation errors (23505) map
to typed 409 API errors. Streaks, records and route position are always computed from `walks`
on the fly, never stored. Stale walks are closed lazily on API access — no cron dependency.

Rationale: the app runs on serverless compute where instances appear and vanish; any
in-memory state is a correctness bug, not a style choice.

### III. Typed Contracts at Every Boundary

All DTOs live in `lib/types.ts`; API responses MUST match them exactly. Input is validated
with Zod schemas from `lib/validation.ts` at every route boundary. Errors flow only through
`apiError` / `validationError` / `handle` from `lib/api.ts`. Drizzle `numeric` values are
converted with `Number(...)` before returning to clients. The layer order is fixed:
`app/api/**` → `lib/db/queries/*` + `lib/game/*` → `lib/db/schema.ts`; the client talks only
to SWR hooks and `apiSend`. `docs/CONTRACT.md` maps who exports what — reuse the foundation,
never duplicate it.

### IV. Localization Is Structural, Not Cosmetic

Every user-facing string goes through `m`/`fmt`/`plural` from `lib/i18n` with full key parity
across `en`/`ru`/`es` dictionaries (enforced by the `Messages` type; `ru` is the reference).
Hint catalogs, LLM prompts and bot texts are per-locale. One locale per deployment via
`NEXT_PUBLIC_LOCALE`, inlined at build time. Hardcoding new UI text is a defect. Code
comments, commit messages, types and names are English only.

### V. LLM Off the Hot Path

No request ever waits on an LLM. Hints are served from `hints_cache` immediately and
regenerated in the background (stale-while-revalidate under a single-row mutex). Degradation
is mandatory and ordered: AI Gateway → previous pool → static catalog. The LLM receives only
anonymized snapshots (slots `u1…uN`); real names are substituted server-side.

### VI. Time Through One Module

All date/time logic goes through `lib/time.ts` (`Europe/Moscow`, office days as `YYYY-MM-DD`,
workdays without a holiday calendar). Computing dates by hand anywhere else is a defect —
timezone drift silently corrupts streaks and daily aggregates.

### VII. Pixel UI System Discipline

The UI kit is 8bitcn over shadcn: `components/ui/8bit/*` wraps `components/ui/*`, and the
base layer is never edited by hand. Palette only via tokens from `app/globals.css`; zero
border radius; shadows without blur; animate only `transform`/`opacity`; touch targets
≥ 44 px. `font="normal"` for readable text, pixel `retro` only for labels/numbers/headings.
Dialogs only through `DialogShell`; icons only via `@/components/ui/icon` (never
`lucide-react`). Static assets are script-generated (`npm run gen:assets`) and committed —
no third-party requests at runtime; generated files are never edited by hand.

## Platform Constraints

- Stack: Next.js App Router, TypeScript strict, React 19, Tailwind 4, Drizzle + Neon
  Postgres (HTTP driver), Zod, SWR. Route Handlers declare `runtime = 'nodejs'` and
  `dynamic = 'force-dynamic'`; in Next 16 `params` is a `Promise`.
- Trust model: no authorization by design — internal tool for "our own people". Feature
  specs MUST NOT introduce auth flows.
- Secrets and env: `DATABASE_URL` required; LLM credentials optional with graceful
  degradation (see Principle V). Cron exists only in production; previews rely on lazy
  fallbacks; Telegram bots are environment-specific.

## Development Workflow

- Every feature gets its own branch; `main` is production — a push deploys and migrates the
  production DB immediately. Direct commits to `main` are forbidden.
- Branch pushes produce preview deploys with their own Neon DB branch (copy-on-write clone).
  Migrations run only via `buildCommand` (`db:migrate`, idempotent `drizzle/*.sql`) — never
  by hand.
- Quality gates before merge: `npm run typecheck` (primary check) and `npm test` (vitest,
  pinned to `ru` locale — content tests assert Russian strings) MUST pass.
- Commits follow `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- Spec Kit flow for substantial features: `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`, with artifacts under `specs/<NNN-feature>/` on the
  feature branch. Small fixes may bypass the flow but never the quality gates.

## Governance

This constitution supersedes ad-hoc practice for everything it covers. `CLAUDE.md` and
`docs/CONTRACT.md` remain the operational guidance and MUST stay consistent with it; when
they drift, the constitution is amended or the docs are corrected in the same PR.

Amendments are made by PR that edits this file, states the rationale, and bumps the version:
MAJOR for removing/redefining a principle, MINOR for adding or materially expanding one,
PATCH for clarifications. `/speckit-plan` constitution checks MUST gate implementation plans
against these principles; violations require an explicit, documented justification or a
design change.

**Version**: 1.0.0 | **Ratified**: 2026-08-16 | **Last Amended**: 2026-08-16
