-- Mid-walk speed changes.
-- The script is idempotent: rerunning breaks nothing.

-- Speed is no longer a single number for the whole walk: pace can change right
-- on the treadmill. History is never rewritten — distance before a change is
-- computed at the old speed, so each constant-speed segment is its own row.
--
-- The first segment is NOT stored: it equals `walks.speed_kmh`, effective from
-- `walks.started_at`. Walks with no speed change (including all existing ones)
-- need no rows here and no backfill, and `walks.speed_kmh` remains the start
-- speed forever.
create table if not exists walk_speed_segments (
  id         uuid primary key default gen_random_uuid(),
  walk_id    uuid not null references walks(id) on delete cascade,
  speed_kmh  smallint not null,
  started_at timestamptz not null default now(),

  constraint walk_segment_speed_range check (speed_kmh between 1 and 25)
);

-- The one read pattern: all segments of a walk in ascending time order.
create index if not exists walk_speed_segments_walk_idx
  on walk_speed_segments (walk_id, started_at);
