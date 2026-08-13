-- «Дорожка освободилась» (п. 6.10.4): отдельный тумблер категории.
-- Скрипт идемпотентен.
alter table telegram_links add column if not exists notify_free boolean not null default true;
