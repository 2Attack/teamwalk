<p align="right"><a href="README.md">English</a> · <b>Русский</b> · <a href="README.es.md">Español</a></p>

<p align="center">
  <img src="docs/screenshots/header.png" alt="TeamWalk — walk together, compete gently, ship steps. Внутренний трекер офисной беговой дорожки для команд: без аккаунтов и авторизации — для команд, которые доверяют друг другу и просто хотят больше ходить." width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle + Neon">
  <img src="https://img.shields.io/badge/tested_with-Vitest-6E9F18?logo=vitest&logoColor=white" alt="Vitest">
  <img src="https://img.shields.io/badge/license-MIT-a3e635" alt="MIT license">
</p>

Кто, когда и сколько прошёл — с лидербордом, стриками, ачивками, общим командным маршрутом по реальным городам и тикером шуточных подсказок, которые генерируются из живых данных. Построен по ТЗ в [`TeamWalk_TZ.md`](TeamWalk_TZ.md) (в коде — «spec § N»). **Авторизации нет by design**: выбираешь себя из списка, прогулка стартует в один тап.

## Возможности

- **Прогулка в один тап** — выбрал себя, выбрал скорость, отсчёт 3-2-1-GO; живой таймер, дистанция, прогресс к рекорду дня и анимированный пиксельный ходок.
- **Лидерборд и подиум** — неделя / месяц / всё время; недели начинаются в понедельник 00:00 МСК.
- **Стрики с заморозками** — только рабочие дни; 2 автоматические заморозки в месяц прощают пропуск.
- **20 ачивок за характер, а не объём** — «Ранняя пташка», «Дзен», «Марафон» и другие.
- **Командный маршрут** — километры всех складываются и двигают команду по реальному маршруту («Ярославль → Лиссабон»).
- **Тикер подсказок** — фразы в духе игровых загрузочных экранов, собранные LLM из анонимизированной статистики.
- **Telegram-бот (опционально)** — итоги прогулок, напоминания, «дорожка освободилась», дайджест по понедельникам.
- **Пиксельный UI** — 8bitcn поверх shadcn, всегда тёмный, PWA, mobile-first.
- **Три языка** — en / ru / es, один на деплой.

## Стек

Next.js 16 (App Router) · TypeScript strict · React 19 · Tailwind CSS 4 · Drizzle ORM ·
Neon Postgres (HTTP-драйвер) · Zod · SWR · Motion · Vercel AI Gateway (AI SDK) · Vitest.

Иконки — [pixelarticons](https://pixelarticons.com) (MIT); аватары — DiceBear `pixel-art`. И то и другое закоммичено на этапе генерации (`npm run gen:assets`) — **в рантайме нет запросов к третьим сторонам**.

## Быстрый старт

Нужны Node.js 20+ и база [Neon](https://neon.tech) Postgres (или [локальная схема без облака](#локальная-база-без-облака)).

```bash
npm install
cp .env.example .env.local        # вписать DATABASE_URL от Neon
npm run db:migrate                # схема + сид дорожки
npm run dev
```

Приложение полностью работает без LLM-ключей (тикер крутит статический каталог) и без токена Telegram (уведомления просто выключены).

## Деплой

### Vercel (в один клик)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fattack-it%2Fteamwalk&env=NEXT_PUBLIC_LOCALE,TELEGRAM_ENABLED,TELEGRAM_BOT_TOKEN,TELEGRAM_WEBHOOK_SECRET,CRON_SECRET&envDescription=UI%20locale%3A%20en%2C%20ru%20or%20es.%20Telegram%3A%20paste%20the%20bot%20token%20from%20%40BotFather%2C%20or%20set%20TELEGRAM_ENABLED%3Dfalse%20and%20put%20%27-%27%20in%20the%20token%20fields.%20TELEGRAM_WEBHOOK_SECRET%20and%20CRON_SECRET%3A%20any%20random%20strings.&envLink=https%3A%2F%2Fgithub.com%2Fattack-it%2Fteamwalk%23readme&project-name=teamwalk&repository-name=teamwalk&stores=%5B%7B%22type%22%3A%22integration%22%2C%22integrationSlug%22%3A%22neon%22%2C%22productSlug%22%3A%22neon%22%7D%5D)

Кнопка форкает репозиторий, спрашивает переменные (локаль, опциональный Telegram-бот, секрет крона) и подключает **Neon Postgres** из Marketplace — `DATABASE_URL` подставляется автоматически, `buildCommand` прогоняет миграции. Если указан Telegram-токен, каждый продакшен-деплой сам регистрирует вебхук бота (`scripts/tg-set-webhook.mts`) — ручной `setWebhook` не нужен. LLM-подсказки работают из коробки: на Vercel AI SDK аутентифицируется автоматическим `VERCEL_OIDC_TOKEN`.

Ручная настройка — те же три шага: импорт репозитория → Neon Postgres из Storage → деплой из `main`. Любая другая ветка получает превью со своей copy-on-write веткой БД (см. [Превью-деплои](#превью-деплои)).

### Docker (self-hosted)

Приложение говорит на Neon-протоколе SQL-over-HTTP, поэтому стек — приложение + Postgres + [Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy); всё собрано в [`docker-compose.yml`](docker-compose.yml):

```bash
NEXT_PUBLIC_LOCALE=ru docker compose up --build   # en (по умолчанию), ru или es
```

Всё: Postgres стартует с уже засеянной control-plane-таблицей, миграции выполняются при старте приложения, оно слушает <http://localhost:3000>. Локаль инлайнится на этапе сборки — для смены языка пересоберите образ. Для Telegram и LLM-подсказок раскомментируйте переменные в `docker-compose.yml` ([Переменные окружения](#переменные-окружения)).

Чтобы направить контейнер на облачный Neon, запустите один образ приложения со своим `DATABASE_URL`:

```bash
docker build -t teamwalk --build-arg NEXT_PUBLIC_LOCALE=ru .
docker run -p 3000:3000 -e DATABASE_URL=postgres://…neon.tech/… teamwalk
```

## Локальная база без облака

Для офлайн-разработки — та же пара «Postgres + Neon HTTP proxy», но без контейнера приложения:

```bash
docker run -d --name cw-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=teamwalk \
  -p 5433:5432 postgres:16-alpine
docker exec -i cw-pg psql -U postgres -d teamwalk < docker/neon-control-plane.sql
docker run -d --name cw-neon-proxy -p 4444:4444 \
  -e PG_CONNECTION_STRING=postgres://postgres:postgres@host.docker.internal:5433/teamwalk \
  ghcr.io/timowilhelm/local-neon-http-proxy:main
```

URL кладётся в **`.env.development.local`** — не в `.env.local`, который перезаписывает `vercel env pull`. В dev этот файл приоритетнее; `next build` его игнорирует; удалите файл — вернётесь на облачную базу:

```
DATABASE_URL=postgres://postgres:postgres@db.localtest.me:4444/teamwalk?sslmode=require
```

Хост `localtest.me` — единственный сигнал, переключающий драйвер на локальный эндпоинт; в продакшене эта ветка не срабатывает. Дальше как обычно: `npm run db:migrate` и `npm run dev`.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Dev-сервер |
| `npm run build` | Продакшен-сборка |
| `npm run typecheck` | `tsc --noEmit` — основная проверка |
| `npm test` | Юнит-тесты (Vitest) |
| `npm run db:migrate` | Применяет `drizzle/*.sql` по порядку, идемпотентно |
| `npm run gen:assets` | Перегенерация статики: аватары, спрайт ходока, иконки |

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `DATABASE_URL` | да | Neon Postgres, pooled-подключение |
| `AI_GATEWAY_API_KEY` | нет | Vercel AI Gateway (подсказки + черновики маршрутов); на деплоях Vercel AI SDK использует автоматический `VERCEL_OIDC_TOKEN` |
| `AI_GATEWAY_MODEL` | нет | Модель Gateway, по умолчанию `xai/grok-4.1-fast-non-reasoning` |
| `HINTS_ENABLED` | нет | `false` → только статический каталог фраз, без LLM |
| `TELEGRAM_BOT_TOKEN` | нет | Бот из @BotFather; без него вся Telegram-подсистема выключена |
| `TELEGRAM_WEBHOOK_SECRET` | нет | Секрет вебхука (`setWebhook … secret_token`) |
| `TELEGRAM_ENABLED` | нет | `false` → бот молчит, панель привязки скрыта |
| `CRON_SECRET` | нет | Защищает `/api/cron/notify` (Vercel Cron шлёт его сам) |
| `NOTIFY_WINDOW_START_HOUR` / `NOTIFY_WINDOW_END_HOUR` | нет | Дневное окно напоминаний и дайджеста, по умолчанию 11–17 МСК |
| `FREE_WINDOW_START_HOUR` / `FREE_WINDOW_END_HOUR` | нет | Окно уведомлений «дорожка освободилась», по умолчанию 9–19 МСК |
| `NEXT_PUBLIC_APP_NAME` | нет | Имя в шапке, по умолчанию `TeamWalk` |
| `NEXT_PUBLIC_LOCALE` | нет | Язык продукта: `en` (по умолчанию), `ru`, `es` |

## Локализация

Один язык на деплой, задаётся `NEXT_PUBLIC_LOCALE`: UI, ошибки API, каталог подсказок, LLM-промпты и тексты бота. Переменная **инлайнится в клиентский бандл на этапе сборки** — смена локали означает редеплой. Словари в `lib/i18n/messages/{ru,en,es}.ts`; `ru` — эталон, тип `Messages` гарантирует полный паритет ключей.

## Превью-деплои

`main` — продакшен, любая другая ветка — превью:

- Пуш ветки → Vercel собирает превью с уникальным URL.
- **Preview branching** Neon создаёт ветку БД `preview/<git-branch>` — мгновенный copy-on-write клон продакшена — и подставляет её `DATABASE_URL` только в этот деплой.
- `buildCommand` гоняет `db:migrate` перед каждой сборкой: каждый деплой мигрирует свою БД.

Telegram на превью выключен (нет переменных бота); крон уведомлений работает только в продакшене — превью полагаются на ленивый fallback при обращениях к API.

## Архитектура

- **Никакого состояния в памяти процесса.** Источник истины таймера — `walks.started_at`; клиент считает `Date.now() − startedAt`.
- **Конкурентностью владеет БД.** Два частичных уникальных индекса гарантируют одну активную прогулку на участника и на дорожку; API маппит `23505` в `409`.
- **LLM никогда не на горячем пути.** Пул подсказок отдаётся из `hints_cache` и перегенерируется в фоне; деградация: AI Gateway → прошлый пул → статический каталог.
- **Персональные данные не покидают периметр.** LLM видит анонимизированный снапшот (`u1…uN`); имена подставляются на нашей стороне.
- **Стрики, рекорды и позиция на маршруте не хранятся** — считаются из `walks` на лету.
- **Время только через `lib/time.ts`** (`Europe/Moscow`, «офисные дни» как `YYYY-MM-DD`).

## Структура проекта

```
app/            страницы и Route Handlers (26 API-эндпоинтов)
components/     UI: пиксельный кит (components/ui/8bit), подиум, лидерборд, тикер
lib/db/         схема Drizzle, клиент Neon, агрегации
lib/hints/      снапшот, промпт, провайдеры, пост-фильтр, кэш, каталог по локалям
lib/game/       стрики с заморозками, ачивки, командный прогресс
lib/telegram/   уведомления, тексты бота по локалям, логика вебхука
lib/i18n/       словари en/ru/es, хелперы fmt/plural
drizzle/        DDL-миграции
docs/CONTRACT.md   границы зон и кросс-модульные сигнатуры
docs/8BITCN.md     правила и грабли UI-кита
```

## Благодарности

UI-кит — [8bitcn/ui](https://8bitcn.com) поверх [shadcn/ui](https://ui.shadcn.com) · иконки — [pixelarticons](https://pixelarticons.com) (MIT) · аватары — [DiceBear](https://dicebear.com) `pixel-art` · шрифты и спрайты генерируются в репозитории.

Распространяется под лицензией [MIT](LICENSE).
