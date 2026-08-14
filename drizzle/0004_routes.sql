-- Team route catalog (spec § 6.12): several routes, exactly one active.

create table if not exists routes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Start mark: position on the route = teamTotalKm - base_km (spec § 6.12.1).
  base_km    numeric(8,2) not null default 0,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);

-- Route names differ case-insensitively — same as treadmills and user names.
create unique index if not exists routes_name_uniq on routes (lower(btrim(name)));

-- Exactly one active route: the same partial-unique-index technique that holds
-- "one active walk per user" (spec § 7.1). No in-process state.
create unique index if not exists routes_one_active on routes (is_active) where is_active;

create table if not exists route_points (
  id       uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,
  city     text not null,
  km       integer not null,  -- cumulative distance from the start
  constraint route_point_km_sane check (km between 0 and 100000)
);

create unique index if not exists route_points_km_uniq   on route_points (route_id, km);
create unique index if not exists route_points_city_uniq on route_points (route_id, lower(btrim(city)));
create index if not exists route_points_route_idx on route_points (route_id, km);

-- Seed (spec § 6.12.6): the previously hardcoded route becomes the active row
-- with base_km = 0, so the rollout changes nothing for users.
do $$
declare rid uuid;
begin
  if not exists (select 1 from routes) then
    insert into routes (name, base_km, is_active)
    values ('Ярославль → Лиссабон', 0, true)
    returning id into rid;

    insert into route_points (route_id, city, km) values
      (rid, 'Ярославль', 0),
      (rid, 'Москва', 265),
      (rid, 'Минск', 995),
      (rid, 'Варшава', 1540),
      (rid, 'Берлин', 2120),
      (rid, 'Брюссель', 2915),
      (rid, 'Париж', 3225),
      (rid, 'Мадрид', 4495),
      (rid, 'Лиссабон', 5120);
  end if;
end $$;
