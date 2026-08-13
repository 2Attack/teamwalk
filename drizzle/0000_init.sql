-- TeamWalk — начальная схема (п. 4.1, 6.6.5, 6.8.5 ТЗ).
-- Скрипт идемпотентен: повторный запуск ничего не ломает.

create extension if not exists "pgcrypto";

-- Участники ---------------------------------------------------------------
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  avatar_id     text not null,
  hints_opt_out boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Регистронезависимая уникальность имени: два "Иван Петров" завести нельзя.
create unique index if not exists users_name_uniq
  on users (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

-- Дорожки -----------------------------------------------------------------
create table if not exists treadmills (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  max_speed_kmh smallint not null default 10,
  is_active     boolean not null default true,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),

  constraint treadmill_max_speed_sane check (max_speed_kmh between 1 and 25)
);

create unique index if not exists treadmills_name_uniq on treadmills (lower(btrim(name)));

-- Прогулки ----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'walk_status') then
    create type walk_status as enum ('active', 'finished', 'cancelled');
  end if;
end
$$;

create table if not exists walks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  treadmill_id uuid not null references treadmills(id) on delete restrict,
  started_at   timestamptz not null default now(),
  speed_kmh    smallint not null,
  ended_at     timestamptz,
  duration_sec integer,
  distance_km  numeric(5,2),
  status       walk_status not null default 'active',
  created_at   timestamptz not null default now(),

  constraint walk_finished_complete check (
    status <> 'finished'
    or (ended_at is not null and distance_km is not null and duration_sec is not null)
  ),
  constraint walk_distance_range check (
    distance_km is null or (distance_km > 0 and distance_km <= 50)
  ),
  constraint walk_speed_range check (speed_kmh between 1 and 25)
);

-- Не более одной активной прогулки на участника и на дорожку (п. 7.1, 7.2).
create unique index if not exists walks_one_active_per_user
  on walks (user_id) where status = 'active';
create unique index if not exists walks_one_active_per_treadmill
  on walks (treadmill_id) where status = 'active';

create index if not exists walks_user_started_idx on walks (user_id, started_at desc);
create index if not exists walks_started_idx      on walks (started_at desc);

-- Геймификация ------------------------------------------------------------
create table if not exists achievements (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  code      text not null,
  earned_at timestamptz not null default now(),
  walk_id   uuid references walks(id) on delete set null
);

create unique index if not exists achievements_user_code_uniq on achievements (user_id, code);

create table if not exists streak_freezes (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  used_on date not null
);

create unique index if not exists streak_freezes_uniq on streak_freezes (user_id, used_on);

-- Хинты -------------------------------------------------------------------
create table if not exists hints_cache (
  id           uuid primary key default gen_random_uuid(),
  text         text not null,
  tone         text not null,
  subject_id   uuid references users(id) on delete cascade,
  source       text not null,
  generated_at timestamptz not null default now()
);

create index if not exists hints_cache_generated_idx on hints_cache (generated_at desc);

create table if not exists hints_meta (
  id           boolean primary key default true check (id),
  locked_until timestamptz not null default now()
);

insert into hints_meta (id, locked_until)
values (true, now())
on conflict (id) do nothing;

-- Сид: без записи в treadmills стартовать прогулку нельзя (п. 9.1).
insert into treadmills (name, max_speed_kmh, is_active, sort_order)
select 'Дорожка', 10, true, 0
where not exists (select 1 from treadmills);
