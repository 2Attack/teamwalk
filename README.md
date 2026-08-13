# TeamWalk

Внутренний трекер ходьбы на беговой дорожке: кто, когда и сколько прошёл, рейтинг,
серии, достижения и лента шутливых хинтов, собранных из реальных данных.

Реализация по `TeamWalk_TZ.md`. Авторизации нет — модель доверия «свои люди».

## Стек

Next.js (App Router) · TypeScript strict · React 19 · Tailwind CSS 4 · Drizzle ORM ·
Neon Postgres (HTTP-драйвер) · Zod · SWR · Motion · Vercel AI Gateway (AI SDK).

Иконки — [pixelarticons](https://pixelarticons.com) (MIT), портреты — DiceBear `pixel-art`.
Оба набора попадают в репозиторий на этапе генерации, в рантайме сторонних запросов нет.

## Локальный запуск

```bash
npm install
cp .env.example .env.local        # впишите DATABASE_URL из Neon
npm run db:migrate                # схема + сид дорожки
npm run dev
```

Без записи в `treadmills` стартовать прогулку нельзя — сид создаёт её автоматически.

### Локальная БД без облака (опционально)

Neon отдаёт SQL по HTTP, поэтому обычный Postgres драйвер не понимает. Для работы
офлайн поднимается связка «Postgres + HTTP-прокси Neon»:

```bash
docker run -d --name cw-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=teamwalk \
  -p 5433:5432 postgres:16-alpine
docker run -d --name cw-neon-proxy -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@host.docker.internal:5433/teamwalk \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
```

Свежие версии прокси перед каждым запросом спрашивают у «control plane» список
разрешённых IP и без этой таблицы отвечают 500 `Control plane request failed`.
Таблицу заводим руками один раз; `db` — имя эндпоинта, то есть первая метка
хоста `db.localtest.me`:

```bash
docker exec -i cw-pg psql -U postgres -d teamwalk <<'SQL'
create schema if not exists neon_control_plane;
create table if not exists neon_control_plane.endpoints (
  endpoint_id varchar(255) primary key,
  allowed_ips varchar(255)
);
insert into neon_control_plane.endpoints (endpoint_id, allowed_ips)
values ('db', '0.0.0.0/0') on conflict (endpoint_id) do nothing;
SQL
```

Затем — `.env.development.local` (а не `.env.local`: тот перезаписывает
`vercel env pull`, и боевые креды лучше не трогать). В dev этот файл имеет
приоритет, `next build` с NODE_ENV=production в него не заглядывает, а чтобы
вернуться на облачную базу, файл достаточно удалить:

```
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:4444/teamwalk?sslmode=require
```

Хост `localtest.me` — единственный признак, по которому код переключает драйвер на
локальный эндпоинт; в проде ветка не срабатывает.

Дальше как обычно: `npm run db:migrate` (скрипт читает те же файлы и в том же
порядке) и `npm run dev`.

### Telegram-бот локально (без webhook)

Telegram не достучится до localhost, поэтому в разработке вместо webhook —
long polling: `npm run dev:tg` (рядом с работающим `npm run dev`) поднимает
мост на grammY, который забирает апдейты поллингом и пробрасывает их в наш
обычный `/api/telegram/webhook` с тем же секретным заголовком. Боевой код
прогоняется целиком — проверка секрета, дедупликация, вся логика бота.

Нужны `TELEGRAM_BOT_TOKEN` и `TELEGRAM_WEBHOOK_SECRET` в `.env.development.local`
(или `.env.local`). Важно: поллинг **снимает у бота зарегистрированный webhook**,
поэтому запускать мост можно только с дев-ботом — заведи отдельного через
@BotFather, не используй токен боевого.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Дев-сервер |
| `npm run dev:tg` | Мост Telegram → localhost: long polling вместо webhook (только дев-бот) |
| `npm run build` | Прод-сборка |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Юнит-тесты (постфильтр хинтов, расчёт серий) |
| `npm run db:migrate` | Применяет `drizzle/*.sql` (идемпотентно) |
| `npm run gen:assets` | Перегенерирует статику: аватары (DiceBear `pixel-art`), спрайт ходока, иконки |
| `npm run gen:icons` | Только иконки: `lib/icons.generated.ts` из пакета `pixelarticons` |

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `DATABASE_URL` | да | Neon Postgres, pooled connection |
| `AI_GATEWAY_API_KEY` | нет | Vercel AI Gateway — LLM-провайдер хинтов; на деплоях Vercel заменяется автоматическим `VERCEL_OIDC_TOKEN` |
| `AI_GATEWAY_MODEL` | нет | Модель Gateway, по умолчанию `xai/grok-4.1-fast-non-reasoning` |
| `HINTS_ENABLED` | нет | `false` → только статический каталог фраз, без обращений к LLM |
| `HINTS_TTL_MINUTES` | нет | Период регенерации пула, по умолчанию 60 |
| `TELEGRAM_BOT_TOKEN` | нет | Бот от @BotFather; без него Telegram-подсистема выключена целиком (п. 6.10 ТЗ) |
| `TELEGRAM_WEBHOOK_SECRET` | нет | Секрет webhook (`setWebhook … secret_token`) и локального моста |
| `CRON_SECRET` | нет | Защита `/api/cron/notify` (Vercel Cron шлёт его сам) |
| `TELEGRAM_ENABLED` | нет | `false` → бот молчит, панель привязки скрыта |
| `NEXT_PUBLIC_APP_NAME` | нет | Название в шапке |

Без ключей LLM приложение полностью работоспособно: лента крутит статические фразы.
Без токена бота — тоже: уведомления просто выключены.

## Превью-деплои

Модель простая: `main` — прод, любая другая ветка — превью.

- Пуш ветки → Vercel собирает preview-деплой с уникальным URL.
- У Neon-интеграции включён **preview branching**: каждому preview-деплою
  Neon создаёт ветку БД `preview/<git-ветка>` — мгновенную copy-on-write
  копию боевой — и вебхуком подставляет её `DATABASE_URL` только в этот
  деплой. Превью не видят боевую базу вовсе; ветка БД удаляется вместе
  с preview-деплоем по retention-политике Vercel.
- `buildCommand` в `vercel.json` гоняет `db:migrate` перед сборкой: каждый
  деплой мигрирует свою БД сам — прод боевую, превью свою ветку. Скрипты
  идемпотентны, повторные прогоны безопасны.

```bash
git checkout -b feature/x && git push -u origin feature/x  # превью со своей БД
git checkout main && git merge feature/x && git push       # прод: деплой + миграции сами
```

Telegram на превью выключен (нет переменных бота — подсистема гаснет сама);
бот `@teamwalk_staging_bot` используется для локальной разработки через
`npm run dev:tg`. Крон на превью не работает (только production) —
напоминания там разносит ленивый фолбэк при обращениях к API.

## Развёртывание на Vercel

1. Репозиторий на GitHub → импорт в Vercel.
2. **Storage → Neon Postgres** (Marketplace): переменные подставляются автоматически.
3. Файловое хранилище не подключается — аватары лежат в репозитории и раздаются с CDN.
   Портреты рисует DiceBear (стиль `pixel-art`), но только на этапе `npm run gen:assets`:
   в рантайме к `api.dicebear.com` обращений нет, иначе одна страница рейтинга тянула бы
   десяток сторонних запросов и без сети приложение осталось бы без аватаров.
4. LLM: включить AI Gateway в настройках проекта — на деплое AI SDK
   авторизуется через `VERCEL_OIDC_TOKEN` сам; локально нужен `AI_GATEWAY_API_KEY`
   (Dashboard → AI Gateway → API Keys). Без кредов хинты крутят статику.
5. Миграции: `npm run db:migrate` локально с продовым `DATABASE_URL`.
6. Деплой из `main`, preview-деплои для остальных веток.

Cron не используется: «зависшие» прогулки закрываются ленивой проверкой при
обращении к API (п. 7.6 ТЗ), а не по расписанию — на Hobby-плане 1 запуск в сутки.

## Архитектурные опоры

- **Никакого состояния в памяти процесса.** Источник истины таймера — `walks.started_at`;
  клиент считает `Date.now() − startedAt`, поэтому перезагрузка страницы, засыпание
  устройства и переход на другое устройство не ломают отсчёт.
- **Конкурентность держит БД, а не код.** Два partial unique index'а гарантируют одну
  активную прогулку на участника и одну на дорожку; API переводит `23505` в понятные
  `409 WALK_ALREADY_ACTIVE` / `409 TREADMILL_BUSY`.
- **LLM никогда не в горячем пути.** Пул хинтов лежит в `hints_cache`, отдаётся
  немедленно и регенерируется в фоне (stale-while-revalidate) под строкой-мьютексом.
  Цепочка деградации: AI Gateway → прошлый пул → статический каталог.
- **Персональные данные не покидают периметр.** В LLM уходит обезличенный снапшот со
  слотами `u1…uN`; реальные имена подставляются на нашей стороне.
- **Серии, рекорды и позиция на маршруте не хранятся** — вычисляются из `walks`, поэтому
  удаление прогулки пересчитывает их само собой.

## Структура

```
app/            страницы и Route Handlers
components/     UI: пиксельный кит, пьедестал, таблица, лента хинтов
lib/db/         Drizzle-схема, клиент Neon, агрегации
lib/hints/      снапшот, промпт, провайдеры, постфильтр, кэш, маршрут
lib/game/       серии с заморозками, достижения, прогресс команды
drizzle/        DDL-миграции
docs/CONTRACT.md  границы зон и межмодульные сигнатуры
```
