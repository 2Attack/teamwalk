-- Telegram-уведомления (п. 6.10 ТЗ). Скрипт идемпотентен.

-- Привязка и настройки: отдельная таблица, а не колонки в users —
-- привязки нет у большинства, а настройки без привязки бессмысленны.
create table if not exists telegram_links (
  user_id        uuid primary key references users(id) on delete cascade,
  chat_id        bigint not null unique,          -- один чат — один участник
  linked_at      timestamptz not null default now(),
  muted_until    timestamptz,                     -- /mute; null = не заглушено
  notify_start   boolean not null default true,
  notify_finish  boolean not null default true,
  notify_remind  boolean not null default true,
  notify_digest  boolean not null default true,
  attach_hints   boolean not null default true
);

-- Одноразовые токены привязки (deep link t.me/<бот>?start=<токен>)
create table if not exists telegram_link_tokens (
  token       text primary key,                   -- 32 hex из crypto
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

-- Идемпотентность webhook: Telegram ретраит недоставленные апдейты
create table if not exists telegram_updates (
  update_id   bigint primary key,
  received_at timestamptz not null default now()
);

-- Журнал отправок: и дедупликация, и вся логика частоты напоминаний
create table if not exists notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  kind       text not null,                       -- 'start' | 'finish' | 'autoclose' | 'remind' | 'digest'
  dedup_key  text not null,                       -- 'finish:<walkId>', 'remind:<userId>:<day>', …
  sent_at    timestamptz not null default now()
);
-- Имя индекса совпадает со schema.ts — как у остальных unique-констрейнтов проекта.
create unique index if not exists notification_log_dedup_uniq
  on notification_log (dedup_key);
create index if not exists notification_log_user_kind_idx
  on notification_log (user_id, kind, sent_at desc);

-- Мьютекс ленивого фолбэка рассылки — копия hints_meta (п. 6.6.5)
create table if not exists notify_meta (
  id           boolean primary key default true check (id),
  locked_until timestamptz not null default now()
);

-- Счётчики панели-приглашения на экране прогулки — на участнике:
-- работают до привязки, когда строки в telegram_links ещё нет.
alter table users add column if not exists tg_nudge_count     smallint    not null default 0;
alter table users add column if not exists tg_nudge_last_at   timestamptz;
alter table users add column if not exists tg_nudge_dismissed boolean     not null default false;
