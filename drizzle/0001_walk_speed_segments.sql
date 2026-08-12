-- Смена скорости в процессе прогулки (п. 6.3).
-- Скрипт идемпотентен: повторный запуск ничего не ломает.

-- Скорость перестала быть одним числом на всю прогулку: человек может прибавить
-- или сбросить темп прямо на дорожке. Прошлое при этом не переписывается —
-- пройденное до смены считается по прежней скорости, поэтому каждый отрезок
-- постоянной скорости хранится отдельной строкой.
--
-- Первый отрезок в таблице НЕ хранится: он равен `walks.speed_kmh`, действующей
-- с `walks.started_at`. Значит, прогулки без единой смены скорости (в том числе
-- все существующие) не требуют ни одной строки здесь и не нуждаются в бэкфилле,
-- а `walks.speed_kmh` навсегда остаётся скоростью старта.
create table if not exists walk_speed_segments (
  id         uuid primary key default gen_random_uuid(),
  walk_id    uuid not null references walks(id) on delete cascade,
  speed_kmh  smallint not null,
  started_at timestamptz not null default now(),

  constraint walk_segment_speed_range check (speed_kmh between 1 and 25)
);

-- Читаем всегда одинаково: все отрезки одной прогулки по возрастанию времени.
create index if not exists walk_speed_segments_walk_idx
  on walk_speed_segments (walk_id, started_at);
