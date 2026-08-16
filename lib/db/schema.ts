import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Walk statuses (spec § 4.1). */
export const walkStatus = pgEnum('walk_status', ['active', 'finished', 'cancelled']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    avatarId: text('avatar_id').notNull(),
    hintsOptOut: boolean('hints_opt_out').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** "Don't show again" for the Telegram-link panel (spec § 6.10.2). Stored in
     * the DB, not localStorage, so the opt-out holds on any device; unlinking
     * resets it. tg_nudge_count/tg_nudge_last_at still exist in the DB but are retired. */
    tgNudgeDismissed: boolean('tg_nudge_dismissed').notNull().default(false),
  },
  (t) => [
    uniqueIndex('users_name_uniq').on(
      sql`lower(regexp_replace(btrim(${t.name}), '\\s+', ' ', 'g'))`,
    ),
  ],
);

/** Team route catalog (spec § 6.12): several routes, exactly one active. */
export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    /** Start mark: position on the route = teamTotalKm − base_km (spec § 6.12.1). */
    baseKm: numeric('base_km', { precision: 8, scale: 2 }).notNull().default('0'),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('routes_name_uniq').on(sql`lower(btrim(${t.name}))`),
    // Exactly one active route — same technique as one active walk (spec § 7.1).
    uniqueIndex('routes_one_active').on(t.isActive).where(sql`${t.isActive}`),
  ],
);

export const routePoints = pgTable(
  'route_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => routes.id, { onDelete: 'cascade' }),
    city: text('city').notNull(),
    /** Cumulative distance from the start; ordering is defined by it alone. */
    km: integer('km').notNull(),
  },
  (t) => [
    uniqueIndex('route_points_km_uniq').on(t.routeId, t.km),
    uniqueIndex('route_points_city_uniq').on(t.routeId, sql`lower(btrim(${t.city}))`),
    index('route_points_route_idx').on(t.routeId, t.km),
  ],
);

export const treadmills = pgTable(
  'treadmills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    maxSpeedKmh: smallint('max_speed_kmh').notNull().default(10),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: smallint('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('treadmills_name_uniq').on(sql`lower(btrim(${t.name}))`)],
);

export const walks = pgTable(
  'walks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    treadmillId: uuid('treadmill_id')
      .notNull()
      .references(() => treadmills.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    speedKmh: smallint('speed_kmh').notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSec: integer('duration_sec'),
    /** numeric(5,2) — money-like precision, not float (spec § 4.2). */
    distanceKm: numeric('distance_km', { precision: 5, scale: 2 }),
    status: walkStatus('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('walks_one_active_per_user')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    uniqueIndex('walks_one_active_per_treadmill')
      .on(t.treadmillId)
      .where(sql`${t.status} = 'active'`),
    index('walks_user_started_idx').on(t.userId, t.startedAt.desc()),
    index('walks_started_idx').on(t.startedAt.desc()),
  ],
);

/**
 * Speed segments within a walk (spec § 6.3): speed can change mid-walk.
 * The first segment is not stored here — `walks.speedKmh` + `walks.startedAt`
 * serve as it, so a walk with no speed changes produces zero rows and
 * `walks.speedKmh` stays the starting speed forever.
 */
export const walkSpeedSegments = pgTable(
  'walk_speed_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walkId: uuid('walk_id')
      .notNull()
      .references(() => walks.id, { onDelete: 'cascade' }),
    speedKmh: smallint('speed_kmh').notNull(),
    /** The moment this speed takes effect. */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('walk_speed_segments_walk_idx').on(t.walkId, t.startedAt)],
);

export const achievements = pgTable(
  'achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
    walkId: uuid('walk_id').references(() => walks.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('achievements_user_code_uniq').on(t.userId, t.code)],
);

export const streakFreezes = pgTable(
  'streak_freezes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    usedOn: date('used_on').notNull(),
  },
  (t) => [uniqueIndex('streak_freezes_uniq').on(t.userId, t.usedOn)],
);

export const hintsCache = pgTable(
  'hints_cache',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Text with names already substituted. */
    text: text('text').notNull(),
    tone: text('tone').notNull(),
    subjectId: uuid('subject_id').references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    /** Deployment locale the row was generated in (see NEXT_PUBLIC_LOCALE). */
    locale: text('locale').notNull().default('ru'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hints_cache_generated_idx').on(t.generatedAt.desc())],
);

/** Single-row mutex against concurrent pool regeneration (spec § 6.6.5). */
export const hintsMeta = pgTable('hints_meta', {
  id: boolean('id').primaryKey().default(true),
  lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull().defaultNow(),
});

/** Telegram link and notification preferences (spec § 6.10.6). */
export const telegramLinks = pgTable('telegram_links', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** One chat — one participant. */
  chatId: bigint('chat_id', { mode: 'number' }).notNull().unique(),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  /** `/mute`; null = not muted. */
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  notifyStart: boolean('notify_start').notNull().default(true),
  notifyFinish: boolean('notify_finish').notNull().default(true),
  notifyRemind: boolean('notify_remind').notNull().default(true),
  notifyDigest: boolean('notify_digest').notNull().default(true),
  /** "Treadmill freed" — only on the "all busy → free" transition (spec § 6.10.4). */
  notifyFree: boolean('notify_free').notNull().default(true),
  attachHints: boolean('attach_hints').notNull().default(true),
});

/** One-time tokens for the link deep link (spec § 6.10.3). */
export const telegramLinkTokens = pgTable('telegram_link_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/** Webhook idempotency: Telegram retries undelivered updates. */
export const telegramUpdates = pgTable('telegram_updates', {
  updateId: bigint('update_id', { mode: 'number' }).primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Send log: dedup and all reminder-cadence logic (spec § 6.10.5). */
export const notificationLog = pgTable(
  'notification_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    dedupKey: text('dedup_key').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('notification_log_dedup_uniq').on(t.dedupKey),
    index('notification_log_user_kind_idx').on(t.userId, t.kind, t.sentAt.desc()),
  ],
);

/** Mutex for the lazy notification fallback — a copy of `hints_meta` (spec § 6.10.5). */
export const notifyMeta = pgTable('notify_meta', {
  id: boolean('id').primaryKey().default(true),
  lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Treadmill = typeof treadmills.$inferSelect;
export type RouteRow = typeof routes.$inferSelect;
export type RoutePointRow = typeof routePoints.$inferSelect;
export type Walk = typeof walks.$inferSelect;
export type WalkSpeedSegment = typeof walkSpeedSegments.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type HintRow = typeof hintsCache.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
