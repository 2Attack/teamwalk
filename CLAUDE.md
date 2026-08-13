# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Что это

TeamWalk — внутренний трекер ходьбы на беговой дорожке (Next.js App Router, TypeScript strict, React 19, Tailwind 4, Drizzle + Neon Postgres HTTP-драйвер, Zod, SWR). Требования — в `TeamWalk_TZ.md` (в коде и доках ссылки вида «п. 6.7.1» указывают на его пункты). Авторизации нет намеренно — модель доверия «свои люди».

**Язык:** интерфейс и комментарии — русский; типы и имена — английские.

## Команды

```bash
npm run dev          # дев-сервер
npm run build        # прод-сборка
npm run typecheck    # tsc --noEmit — основная проверка
npm test             # vitest run (tests/*.test.ts)
npx vitest run tests/streak.test.ts   # один тестовый файл
npm run db:migrate   # применяет drizzle/*.sql по порядку, идемпотентно
npm run gen:assets   # перегенерация статики: аватары, спрайты, иконки
```

Нужен `DATABASE_URL` (Neon) в `.env.local`. Локальная БД без облака — docker-связка «Postgres + neon-http-proxy», описана в README (включая обязательную таблицу `neon_control_plane.endpoints`); её `DATABASE_URL` кладётся в `.env.development.local`, драйвер переключается на локальный эндпоинт по хосту `localtest.me`. LLM-ключи (`GEMINI_API_KEY`, `GROQ_API_KEY`) опциональны — без них хинты крутят статический каталог.

## Архитектура

- **Никакого состояния в памяти процесса.** Источник истины таймера — `walks.started_at`; клиент считает `Date.now() − startedAt`.
- **Конкурентность держит БД.** Два partial unique index'а: одна активная прогулка на участника и одна на дорожку. API переводит ошибку `23505` в `409 WALK_ALREADY_ACTIVE` / `409 TREADMILL_BUSY`.
- **Серии, рекорды, позиция на маршруте не хранятся** — вычисляются из `walks` на лету.
- **«Зависшие» прогулки** закрывает `lib/walks/autoclose.ts` лениво при обращении к API — cron не используется (Hobby-план Vercel).
- **LLM никогда не в горячем пути.** Пул хинтов в `hints_cache`, отдаётся сразу, регенерируется в фоне (stale-while-revalidate под строкой-мьютексом). Деградация: Gemini → Groq → прошлый пул → статический каталог. В LLM уходит обезличенный снапшот (слоты `u1…uN`), имена подставляются на нашей стороне.
- **Время** — всегда через `lib/time.ts` (`Europe/Moscow`, «офисные дни» `YYYY-MM-DD`, рабочие дни без производственного календаря). Не считать даты руками.

Слои: `app/api/**` (Route Handlers) → `lib/db/queries/*` (агрегации) и `lib/game/*` (серии/достижения/прогресс) → `lib/db/schema.ts`. Клиент ходит только через SWR-хуки и `apiSend` из `lib/client/api.ts`. Все DTO — в `lib/types.ts`, Zod-схемы — в `lib/validation.ts`, константы — в `lib/config.ts`.

`docs/CONTRACT.md` — карта зон и межмодульных сигнатур: где что лежит и кто что экспортирует. Фундамент (`lib/api.ts`, `lib/format.ts`, `lib/time.ts`, `lib/db/*` и т. д.) использовать, не дублировать.

## Правила API-слоя

- Route Handlers: `export const runtime = 'nodejs'` и `export const dynamic = 'force-dynamic'`.
- Ошибки — только через `apiError` / `validationError` / `handle` из `lib/api.ts`.
- В Next 16 `params` — это `Promise`: `{ params }: { params: Promise<{ id: string }> }`.
- `numeric` из Drizzle приходит **строкой** — приводить `Number(...)` перед выдачей клиенту.
- Ответы строго соответствуют DTO из `lib/types.ts`.

## UI

UI-кит — 8bitcn (copy-paste поверх shadcn): `components/ui/8bit/*` оборачивает базу `components/ui/*` (базу вручную не править). Все мины и правила — в `docs/8BITCN.md`; главные:

- `font="normal"` для всего, что читают (имена, тексты); пиксельный `retro` — только метки кнопок, числа, заголовки, бейджи.
- База Tabs собрана на **Base UI**, а не Radix: активное состояние — `data-active:`, и его надо дублировать `dark:`-вариантом (тема всегда тёмная).
- Модалки — только через `components/DialogShell.tsx`.
- После `npx shadcn add @8bitcn/<name>` из `components/ui/8bit/styles/retro.css` нужно снимать вернувшийся `@import` Google Fonts.
- Палитра — токены из `app/globals.css` (`bg-bg-panel`, `text-text-dim`, `text-citrus`, `text-lime`…), никаких `bg-[#...]`. Скругление 0, тени без blur, анимировать только `transform`/`opacity`, тач-таргеты ≥ 44 px.
- Иконки — только `@/components/ui/icon` (пиксельные 16×16); `lucide-react` не использовать. `Select` из 8bitcn не ставим сознательно.
- Статика (аватары DiceBear, спрайты, `lib/icons.generated.ts`) генерируется скриптами и лежит в репозитории — в рантайме сторонних запросов нет; не редактировать сгенерированное руками.
