# Контракт параллельной разработки TeamWalk

Источник требований — `TeamWalk_TZ.md` (в корне). Этот файл фиксирует **границы
ответственности** и **сигнатуры**, чтобы несколько исполнителей работали одновременно
и не переписывали друг друга.

## Общие правила

1. **Пиши только файлы из своей зоны.** Чужие файлы — только читать.
2. **Не трогай** `package.json`, `tsconfig.json`, `app/layout.tsx`, `app/globals.css`,
   `lib/config.ts`, `lib/types.ts`, `lib/validation.ts`, `lib/format.ts`, `lib/time.ts`,
   `lib/api.ts`, `lib/cn.ts`, `lib/avatars.ts`, `lib/db/*`, `lib/client/api.ts`,
   `lib/hints/route.ts`, `drizzle/*`. Всё нужное там уже есть.
3. **Не запускай** `npm install`, `npm run build`, `npm run dev`. Проверка — `npx tsc --noEmit`
   (чужие незаконченные файлы могут давать ошибки — правь только свои).
4. Язык интерфейса и комментариев — русский. Типы и имена — английские.
5. Все ответы API строго соответствуют DTO из `lib/types.ts`.
6. Ошибки API — только через `apiError/validationError/handle` из `lib/api.ts`.
7. Route Handlers: `export const runtime = 'nodejs'` и `export const dynamic = 'force-dynamic'`.
8. В Next 16 `params` в route-хендлерах и страницах — это `Promise`:
   `{ params }: { params: Promise<{ id: string }> }`.
9. `numeric` из Drizzle приходит **строкой** — приводи `Number(...)` перед выдачей клиенту.

## Готовый фундамент (использовать, не дублировать)

| Файл | Что даёт |
|---|---|
| `lib/db/index.ts` | `db` (Drizzle + Neon HTTP), `sqlClient` для сырого SQL |
| `lib/db/schema.ts` | таблицы `users, treadmills, walks, achievements, streakFreezes, hintsCache, hintsMeta` |
| `lib/types.ts` | все DTO ответов API |
| `lib/validation.ts` | Zod-схемы: `createUserSchema, patchUserSchema, startWalkSchema, finishWalkSchema, periodSchema, llmHintsSchema` |
| `lib/format.ts` | `formatDuration, formatKm, calcDistanceKm, avgSpeedKmh, normalizeName, plural, parseDecimalInput` |
| `lib/time.ts` | `toOfficeDay, officeDayStart, addOfficeDays, diffOfficeDays, isWeekend, prevWorkday, periodStart, officeMonth` |
| `lib/config.ts` | все константы (лимиты, TTL, окна) |
| `lib/avatars.ts` | каталог 24 пресетов, `isAvatarId`, `avatarSrc`, `randomAvatarId` |
| `lib/api.ts` | `apiError, validationError, handle, isUniqueViolation, readJson` |
| `lib/cn.ts` | `cn()` — слияние Tailwind-классов |
| `lib/client/api.ts` | SWR-хуки и `apiSend` для всего UI |
| `lib/hints/route.ts` | `ROUTE`, `positionOnRoute(totalKm)` |
| `app/globals.css` | палитра (`bg-deep, bg-panel, border-dim, citrus, lime, text-main, text-dim, silver, bronze`), классы `.pixel-panel`, `.pixel-btn`, `.font-pixel`, `.pixelated`, `.animate-blink` |

Цвета в Tailwind: `bg-bg-panel`, `text-text-dim`, `border-citrus`, `text-lime` и т. п.

## Межмодульные сигнатуры (реализует владелец, вызывают остальные)

```ts
// lib/walks/autoclose.ts — владелец: WALKS
export async function closeStaleWalks(): Promise<number>;

// lib/db/queries/leaderboard.ts — владелец: LEADERBOARD
export async function getLeaderboard(selection: PeriodSelection): Promise<LeaderboardDto>;
export async function getUserRank(userId: string, period?: Period): Promise<number | null>;
export async function getTeamTotalKm(): Promise<number>;

// lib/db/queries/users.ts — владелец: USERS
export async function listUsers(): Promise<UserDto[]>;
export async function getUser(id: string): Promise<UserDto | null>;

// lib/db/queries/walks.ts — владелец: WALKS
export async function getActiveWalk(userId: string): Promise<ActiveWalkDto | null>;
export async function listUserWalks(userId: string, limit: number): Promise<WalkDto[]>;
export async function listActiveWalks(): Promise<ActiveWalkDto[]>;

// lib/game/streak.ts — владелец: GAME
export async function getStreak(userId: string, now?: Date): Promise<StreakDto>;
export async function getStreakDaysBulk(userIds: string[]): Promise<Map<string, number>>;

// lib/game/achievements.ts — владелец: GAME
export const ACHIEVEMENTS: ReadonlyArray<{ code: string; title: string; description: string }>;
export async function awardAchievements(userId: string, walkId: string): Promise<AchievementDto[]>;
export async function listUserAchievements(userId: string): Promise<AchievementDto[]>;

// lib/game/progress.ts — владелец: GAME
export async function getTeamProgress(): Promise<TeamProgressDto>;
export async function getPersonalRecord(userId: string, excludeWalkId?: string):
  Promise<{ bestDayKm: number; bestWalkKm: number }>;

// lib/hints/select.ts — владелец: HINTS
export async function getHintsPool(userId?: string): Promise<HintsResponseDto>;
export function ensureFreshPool(): void; // фоновая регенерация через waitUntil

// lib/telegram/* — владелец: TELEGRAM (п. 6.10 ТЗ)
// notify-функции самодостаточны: сами читают привязку, дедупятся по notification_log,
// никогда не бросают; вызывать через waitUntil(...) после ответа клиенту.
export async function notifyWalkStarted(walk: ActiveWalkDto): Promise<void>;
export async function notifyWalkFinished(result: FinishWalkResultDto): Promise<void>;
export async function notifyAutoClosed(closed: Array<{ walkId: string; userId: string }>): Promise<void>;
export async function wereAllTreadmillsBusy(): Promise<boolean>; // вызывать ДО освобождения дорожки
export async function notifyTreadmillFreed(input: { walkId: string; treadmillName: string;
  freedByUserId: string; busySec: number }): Promise<void>; // широковещательное, дедуп free:<walkId>
export function ensureNotifySweep(): void; // ленивый фолбэк cron: лок notify_meta, не чаще раза в час
export async function runNotifySweep(now?: Date): Promise<void>; // напоминания + дайджест (вызывает cron)
export async function getTelegramStatus(userId: string): Promise<TelegramStatusDto | null>;
export async function processTelegramUpdate(update: unknown): Promise<void>; // webhook, дедуп по update_id

// components/ui/* — владелец: UIKIT (см. ниже)
```

## UI-кит (владелец UIKIT, используют все UI-агенты)

```tsx
// components/ui/button.tsx
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  pixel?: boolean;          // пиксельный шрифт на метке, по умолчанию true
}): JSX.Element;

// components/ui/card.tsx
export function Card(props: { title?: React.ReactNode; accent?: boolean; className?: string;
  children: React.ReactNode }): JSX.Element;

// components/ui/input.tsx
export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string; error?: string; hint?: string }): JSX.Element;

// components/ui/dialog.tsx  (нативный <dialog>, Esc и клик по подложке закрывают)
export function Dialog(props: { open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode }): JSX.Element | null;

// components/ui/badge.tsx
export function Badge(props: { tone?: 'citrus' | 'lime' | 'dim' | 'silver' | 'bronze';
  children: React.ReactNode; className?: string }): JSX.Element;

// components/ui/progress.tsx
export function Progress(props: { value: number; max?: number; className?: string }): JSX.Element;

// components/ui/skeleton.tsx
export function Skeleton(props: { className?: string }): JSX.Element;

// components/Avatar.tsx
export function Avatar(props: { avatarId: string; name?: string; size?: number;
  ring?: 'gold' | 'silver' | 'bronze' | 'none'; className?: string }): JSX.Element;

// components/AvatarPicker.tsx
export function AvatarPicker(props: { value: string; onChange: (id: string) => void;
  taken?: string[] }): JSX.Element;
```

## Зоны ответственности

| Зона | Файлы |
|---|---|
| **ASSETS** | `public/avatars/pixel-01..24.svg`, `public/sprites/*`, `lib/icons.generated.ts` |
| **USERS** | `app/api/users/route.ts`, `app/api/users/[id]/route.ts`, `app/api/users/[id]/walks/route.ts`, `lib/db/queries/users.ts` |
| **WALKS** | `app/api/treadmills/route.ts`, `app/api/walks/**`, `lib/db/queries/walks.ts`, `lib/walks/autoclose.ts` |
| **LEADERBOARD** | `app/api/leaderboard/route.ts`, `app/api/stats/route.ts`, `lib/db/queries/leaderboard.ts` |
| **HINTS** | `lib/hints/*` (кроме `route.ts`), `app/api/hints/route.ts`, `tests/hints.filter.test.ts`, `vitest.config.ts` |
| **GAME** | `lib/game/*`, `app/api/users/[id]/stats/route.ts`, `app/api/achievements/route.ts`, `app/api/team/progress/route.ts`, `tests/streak.test.ts` |
| **TELEGRAM** | `lib/telegram/*`, `app/api/telegram/**`, `app/api/users/[id]/telegram/**`, `app/api/cron/notify/route.ts`, `components/TelegramNudge.tsx`, `components/TelegramLinkDialog.tsx`, `tests/telegram.*.test.ts`, `vercel.json`, `drizzle/0002_telegram.sql` |
| **UIKIT** | `components/ui/*`, `components/Avatar.tsx`, `components/AvatarPicker.tsx` |
| **HOME** | `app/page.tsx`, `components/UserSelect.tsx`, `components/AddUserDialog.tsx`, `components/StartWalkCard.tsx`, `components/TreadmillPicker.tsx` |
| **WALKSCREEN** | `app/walk/[id]/page.tsx`, `components/WalkTimer.tsx`, `components/FinishWalkDialog.tsx`, `components/WalkSuccess.tsx`, `components/WalkerSprite.tsx` |
| **BOARDUI** | `components/Podium.tsx`, `components/Leaderboard.tsx`, `components/PeriodTabs.tsx`, `components/TeamProgress.tsx`, `components/StreakBadge.tsx`, `components/HintTicker.tsx`, `components/AchievementToast.tsx` |
