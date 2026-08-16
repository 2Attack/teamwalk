<p align="right"><a href="../README.md">English</a> · <b>Русский</b> · <a href="README.es.md">Español</a></p>

<p align="center">
  <img src="screenshots/header.png" alt="TeamWalk — walk together, compete gently, ship steps. Внутренний трекер офисной беговой дорожки для команд: без аккаунтов и авторизации — для команд, которые доверяют друг другу и просто хотят больше ходить." width="100%">
</p>

<p align="center">
  <a href="https://github.com/attack-it/teamwalk/actions/workflows/ci.yml"><img src="https://github.com/attack-it/teamwalk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://attack-it.github.io/teamwalk/"><img src="https://img.shields.io/badge/landing-live-e8933a" alt="Landing"></a>
  <img src="https://img.shields.io/badge/Next.js_16-App_Router-black?logo=nextdotjs" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
  <img src="https://img.shields.io/badge/Drizzle-Neon_Postgres-C5F74F?logo=drizzle&logoColor=black" alt="Drizzle + Neon">
  <a href="../LICENSE"><img src="https://img.shields.io/github/license/attack-it/teamwalk?color=a3e635" alt="License"></a>
</p>

Кто, когда и сколько прошёл — с лидербордом, стриками, ачивками, общим командным маршрутом по реальным городам и тикером шуточных подсказок, которые генерируются из живых данных. **Авторизации нет by design**: выбираешь себя из списка, прогулка стартует в один тап. Экскурсия — на [лендинге](https://attack-it.github.io/teamwalk/).

## Возможности

- **Прогулка в один тап** — выбрал себя, выбрал скорость, отсчёт 3-2-1-GO; живой таймер, дистанция, прогресс к рекорду дня и анимированный пиксельный ходок.
- **Лидерборд и подиум** — неделя / месяц / всё время; недели начинаются в понедельник 00:00 МСК.
- **Стрики с заморозками** — только рабочие дни; 2 автоматические заморозки в месяц прощают пропуск.
- **20 ачивок за характер, а не объём** — «Ранняя пташка», «Дзен», «Марафон» и другие.
- **Командный маршрут** — километры всех складываются и двигают команду по реальному маршруту («Ярославль → Лиссабон»).
- **Тикер подсказок** — фразы в духе игровых загрузочных экранов, собранные LLM из анонимизированной статистики.
- **Telegram-бот (опционально)** — итоги прогулок, напоминания, «дорожка освободилась», дайджест по понедельникам.

## Быстрый старт

Нужны Node.js 20+ и база [Neon](https://neon.tech) Postgres.

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

Ручная настройка — те же три шага: импорт репозитория → Neon Postgres из Storage → деплой из `main`. Любая другая ветка получает превью со своей copy-on-write веткой БД.

### Docker (self-hosted)

Приложение говорит на Neon-протоколе SQL-over-HTTP, поэтому стек — приложение + Postgres + [Neon HTTP proxy](https://github.com/TimoWilhelm/local-neon-http-proxy); всё собрано в [`docker-compose.yml`](../docker-compose.yml):

```bash
NEXT_PUBLIC_LOCALE=ru docker compose up --build   # en (по умолчанию), ru или es
```

Всё: Postgres стартует с уже засеянной control-plane-таблицей, миграции выполняются при старте приложения, оно слушает <http://localhost:3000>. Локаль инлайнится на этапе сборки — для смены языка пересоберите образ. Для Telegram и LLM-подсказок раскомментируйте переменные в `docker-compose.yml` ([Переменные окружения](#переменные-окружения)).

Чтобы направить контейнер на облачный Neon, запустите один образ приложения со своим `DATABASE_URL`:

```bash
docker build -t teamwalk --build-arg NEXT_PUBLIC_LOCALE=ru .
docker run -p 3000:3000 -e DATABASE_URL=postgres://…neon.tech/… teamwalk
```

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `DATABASE_URL` | да | Neon Postgres, pooled-подключение |
| `NEXT_PUBLIC_LOCALE` | нет | Язык продукта: `en` (по умолчанию), `ru`, `es`; инлайнится при сборке |
| `TELEGRAM_BOT_TOKEN` | нет | Бот из @BotFather; без него вся Telegram-подсистема выключена |
| `TELEGRAM_WEBHOOK_SECRET` | нет | Секрет вебхука (`setWebhook … secret_token`) |
| `CRON_SECRET` | нет | Защищает `/api/cron/notify` (Vercel Cron шлёт его сам) |
| `ACCESS_PIN` | нет | PIN-код доступа на весь деплой: если задан, страницы и API требуют разблокировки через `/pin` (cookie живёт ~год); пусто/не задан — открытый доступ; смена кода разлогинивает все устройства |

Полный список с дефолтами (LLM-подсказки, окна уведомлений, имя приложения) задокументирован в [`.env.example`](../.env.example).

## Как поучаствовать

PR приветствуются. Ответвитесь от `main`, убедитесь, что `npm run typecheck` и `npm test` проходят, и откройте pull request — CI гоняет те же две проверки, а каждая ветка получает превью-деплой со своей copy-on-write веткой БД.

## Благодарности

UI-кит — [8bitcn/ui](https://8bitcn.com) поверх [shadcn/ui](https://ui.shadcn.com) · иконки — [pixelarticons](https://pixelarticons.com) (MIT) · аватары — [DiceBear](https://dicebear.com) `pixel-art` · шрифты и спрайты генерируются в репозитории.

Распространяется под лицензией [MIT](../LICENSE).
