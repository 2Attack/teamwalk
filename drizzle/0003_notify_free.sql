-- "Treadmill is free" (spec § 6.10.4): a separate category toggle.
-- The script is idempotent.
alter table telegram_links add column if not exists notify_free boolean not null default true;
