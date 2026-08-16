-- Telegram notifications. The script is idempotent.

-- Link and settings: a separate table, not columns on users — most members
-- have no link, and settings without a link are meaningless.
create table if not exists telegram_links (
  user_id        uuid primary key references users(id) on delete cascade,
  chat_id        bigint not null unique,          -- one chat — one member
  linked_at      timestamptz not null default now(),
  muted_until    timestamptz,                     -- /mute; null = not muted
  notify_start   boolean not null default true,
  notify_finish  boolean not null default true,
  notify_remind  boolean not null default true,
  notify_digest  boolean not null default true,
  attach_hints   boolean not null default true
);

-- One-time link tokens (deep link t.me/<bot>?start=<token>)
create table if not exists telegram_link_tokens (
  token       text primary key,                   -- 32 hex chars from crypto
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- Webhook idempotency: Telegram retries undelivered updates
create table if not exists telegram_updates (
  update_id   bigint primary key,
  received_at timestamptz not null default now()
);

-- Send log: both deduplication and all reminder-frequency logic
create table if not exists notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,                       -- 'start' | 'finish' | 'autoclose' | 'remind' | 'digest'
  dedup_key  text not null,                       -- 'finish:<walkId>', 'remind:<userId>:<day>', …
  sent_at    timestamptz not null default now()
);
-- Index name matches schema.ts — like the project's other unique constraints.
create unique index if not exists notification_log_dedup_uniq
  on notification_log (dedup_key);
create index if not exists notification_log_user_kind_idx
  on notification_log (user_id, kind, sent_at desc);

-- Mutex for the lazy notification fallback — a copy of hints_meta
create table if not exists notify_meta (
  id           boolean primary key default true check (id),
  locked_until timestamptz not null default now()
);

-- Walk-screen invite panel counters live on the member: they work before
-- linking, when there is no telegram_links row yet.
alter table users add column if not exists tg_nudge_count     smallint    not null default 0;
alter table users add column if not exists tg_nudge_last_at   timestamptz;
alter table users add column if not exists tg_nudge_dismissed boolean     not null default false;
