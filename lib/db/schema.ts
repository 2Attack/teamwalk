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

/** Статусы прогулки (п. 4.1 ТЗ). */
export const walkStatus = pgEnum('walk_status', ['active', 'finished', 'cancelled']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    avatarId: text('avatar_id').notNull(),
    hintsOptOut: boolean('hints_opt_out').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Колонки tg_nudge_* (счётчики показов панели, старая ред. п. 6.10.2) в БД
    // остались, но кодом больше не используются: панель видна всегда до привязки.
  },
  (t) => [
    uniqueIndex('users_name_uniq').on(
      sql`lower(regexp_replace(btrim(${t.name}), '\\s+', ' ', 'g'))`,
    ),
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
    /** numeric(5,2) — деньги-подобная точность, не float (п. 4.2 ТЗ). */
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
 * Отрезки скорости внутри прогулки (п. 6.3): скорость можно менять на ходу.
 *
 * Первый отрезок здесь не лежит — им служит `walks.speedKmh` с `walks.startedAt`.
 * Поэтому прогулка без единой смены скорости не порождает ни одной строки,
 * а `walks.speedKmh` навсегда остаётся скоростью старта.
 */
export const walkSpeedSegments = pgTable(
  'walk_speed_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    walkId: uuid('walk_id')
      .notNull()
      .references(() => walks.id, { onDelete: 'cascade' }),
    speedKmh: smallint('speed_kmh').notNull(),
    /** Момент, с которого действует эта скорость. */
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
    /** Текст уже с подставленными именами. */
    text: text('text').notNull(),
    tone: text('tone').notNull(),
    subjectId: uuid('subject_id').references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('hints_cache_generated_idx').on(t.generatedAt.desc())],
);

/** Одна строка-мьютекс против параллельной регенерации пула (п. 6.6.5). */
export const hintsMeta = pgTable('hints_meta', {
  id: boolean('id').primaryKey().default(true),
  lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull().defaultNow(),
});

/** Привязка Telegram и настройки уведомлений (п. 6.10.6). */
export const telegramLinks = pgTable('telegram_links', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Один чат — один участник. */
  chatId: bigint('chat_id', { mode: 'number' }).notNull().unique(),
  linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  /** `/mute`; null — не заглушено. */
  mutedUntil: timestamp('muted_until', { withTimezone: true }),
  notifyStart: boolean('notify_start').notNull().default(true),
  notifyFinish: boolean('notify_finish').notNull().default(true),
  notifyRemind: boolean('notify_remind').notNull().default(true),
  notifyDigest: boolean('notify_digest').notNull().default(true),
  /** «Дорожка освободилась» — только на переходе «всё занято → свободно» (п. 6.10.4). */
  notifyFree: boolean('notify_free').notNull().default(true),
  attachHints: boolean('attach_hints').notNull().default(true),
});

/** Одноразовые токены deep link'а привязки (п. 6.10.3). */
export const telegramLinkTokens = pgTable('telegram_link_tokens', {
  token: text('token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/** Идемпотентность webhook: Telegram ретраит недоставленные апдейты. */
export const telegramUpdates = pgTable('telegram_updates', {
  updateId: bigint('update_id', { mode: 'number' }).primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Журнал отправок: дедупликация и вся логика частоты напоминаний (п. 6.10.5). */
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

/** Мьютекс ленивого фолбэка рассылки — копия `hints_meta` (п. 6.10.5). */
export const notifyMeta = pgTable('notify_meta', {
  id: boolean('id').primaryKey().default(true),
  lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Treadmill = typeof treadmills.$inferSelect;
export type Walk = typeof walks.$inferSelect;
export type WalkSpeedSegment = typeof walkSpeedSegments.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type HintRow = typeof hintsCache.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
