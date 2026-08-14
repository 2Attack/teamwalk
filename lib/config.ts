/** Single configuration point for the app. No "magic numbers" across the code. */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'TeamWalk';

/*
 * Vercel preview deploy. `NEXT_PUBLIC_VERCEL_ENV` is inlined at build time and
 * therefore works in client components too (the server-side `VERCEL_ENV` is the
 * fallback; it never reaches the browser bundle and stays undefined there).
 */
export const IS_VERCEL_PREVIEW =
  (process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV) === 'preview';

/** Office timezone. Streak and week day boundaries are computed in it (spec § 6.8.5). */
export const TZ = 'Europe/Moscow';

/** Absolute sanity bounds (duplicated in DB CHECK constraints). */
export const MIN_SPEED_KMH = 1;
export const MAX_SPEED_KMH_ABS = 25;
export const MIN_DISTANCE_KM = 0.01;
export const MAX_DISTANCE_KM = 50;

/** Treadmill list position bounds (spec § 6.11.3); the column is a smallint. */
export const TREADMILL_SORT_ORDER_MIN = 0;
export const TREADMILL_SORT_ORDER_MAX = 999;

/** Team route bounds (spec § 6.12.2). */
export const ROUTE_POINTS_MIN = 2;
export const ROUTE_POINTS_MAX = 20;
export const ROUTE_POINT_KM_MAX = 100_000;

/**
 * Route generation is the only place where the user consciously waits for the
 * LLM (spec § 6.12.4) — same margin reasoning as HINTS_LLM_TIMEOUT_MS.
 */
export const ROUTE_LLM_TIMEOUT_MS = 45_000;

/** Default speed for a new participant (spec § 6.2). */
export const DEFAULT_SPEED_KMH = 4;

/** A walk active longer than this is forgotten and auto-closed (spec § 7.6). */
export const STALE_WALK_HOURS = 8;

/** Window for deleting one's own record after finishing (spec § 7.7). */
export const DELETE_WINDOW_MINUTES = 15;

/** Soft warnings in the finish dialog (spec § 6.4). */
export const DISTANCE_MISMATCH_RATIO = 0.3;
export const SUSPICIOUS_AVG_SPEED_KMH = 10;

/** Duration warnings (spec § 7.5). */
export const SHORT_WALK_WARN_SEC = 60;
export const SHORT_WALK_CANCEL_SEC = 10;

/** Streak freezes per calendar month (spec § 6.8.2). */
export const STREAK_FREEZES_PER_MONTH = 2;

/** Hints. */
export const HINTS_ENABLED = process.env.HINTS_ENABLED !== 'false';
export const HINTS_TTL_MINUTES = Number(process.env.HINTS_TTL_MINUTES ?? 60);
export const HINTS_POOL_MIN = 8;
/** Pool ceiling is tunable without a deploy: feed size is a matter of taste, not code. */
export const HINTS_POOL_MAX = Number(process.env.HINTS_POOL_MAX ?? 24);
/** Below this count after filtering the pool is topped up with static phrases (spec § 6.6.4). */
export const HINTS_MIN_AFTER_FILTER = 6;
/*
  The spec (§ 8) says 15 s, but on a live key Gemini Flash does not always fit:
  "thinking" models take 11–20 s and both attempts were cut off by the timeout.
  The user never waits for this request — generation runs in the background via
  waitUntil after the response is sent — so the margin is increased. The hot
  path is still bounded by the `/api/hints` response time, and it never calls
  the LLM at all.
*/
export const HINTS_LLM_TIMEOUT_MS = 45_000;
/** A participant younger than this many days is not teased (spec § 6.6.7). */
export const HINTS_NEWCOMER_DAYS = 3;

/**
 * Telegram notifications (spec § 6.10). Without a token the subsystem is off
 * entirely: the bot is silent, the link panel is hidden — the same degradation
 * shape as with LLM keys. Env vars do not exist on the client, so the client
 * learns the state via `GET /api/users/:id/telegram`, not from this constant.
 */
export const TELEGRAM_ENABLED =
  process.env.TELEGRAM_ENABLED !== 'false' && Boolean(process.env.TELEGRAM_BOT_TOKEN);

/** TTL of the one-time link token (spec § 6.10.3). */
export const TG_LINK_TOKEN_TTL_MINUTES = 15;

/** "Time to stretch" reminders (spec § 6.10.4): all intervals are in workdays. */
export const REMIND_IDLE_WORKDAYS = 2;
export const REMIND_COOLDOWN_WORKDAYS = 3;
/** After this many reminders in a row with no walk, frequency drops to once a week. */
export const REMIND_BACKOFF_AFTER = 3;
export const REMIND_BACKOFF_COOLDOWN_WORKDAYS = 5;
/** After this many — silence until the next finished walk. */
export const REMIND_SILENCE_AFTER = 6;

/**
 * Send window for reminders and the digest: workdays, [11:00, 17:00) MSK.
 * Overridable via env for local runs.
 */
export const NOTIFY_WINDOW_START_HOUR = Number(process.env.NOTIFY_WINDOW_START_HOUR ?? 11);
export const NOTIFY_WINDOW_END_HOUR = Number(process.env.NOTIFY_WINDOW_END_HOUR ?? 17);

/**
 * The "treadmill freed" window is wider (spec § 6.10.4): the narrow reminder
 * window guards against a "reproach at night", while a freed treadmill is
 * useful as long as people are physically in the office — roughly 9 to 19.
 */
export const FREE_WINDOW_START_HOUR = Number(process.env.FREE_WINDOW_START_HOUR ?? 9);
export const FREE_WINDOW_END_HOUR = Number(process.env.FREE_WINDOW_END_HOUR ?? 19);

/** localStorage key of the last selected participant (spec § 6.2). */
export const LAST_USER_STORAGE_KEY = 'teamwalk:lastUserId';
