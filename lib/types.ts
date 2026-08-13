/**
 * DTO API — общий контракт между Route Handlers и UI.
 * Всё, что уходит клиенту, описано здесь; числа уже числа, даты — ISO-строки.
 */
import type { HintTone, Period, PeriodSelection } from './validation';

export type { HintTone, Period, PeriodSelection };

export interface UserDto {
  id: string;
  name: string;
  avatarId: string;
  hintsOptOut: boolean;
}

/** Статус Telegram для карточки и панели-приглашения (п. 6.10.2). */
export interface TelegramStatusDto {
  /** Подсистема включена на сервере (есть токен бота и рубильник не опущен). */
  enabled: boolean;
  linked: boolean;
  /** Панель можно показывать: не привязан, не отказался, лимиты показов не выбраны. */
  nudgeEligible: boolean;
}

/** Ответ `POST /api/users/:id/telegram/link-token` (п. 6.10.3). */
export interface TelegramLinkTokenDto {
  /** `https://t.me/<бот>?start=<токен>` */
  url: string;
  expiresAt: string;
}

/** Кто сейчас занимает дорожку. `null` — свободна. */
export interface TreadmillBusyDto {
  walkId: string;
  user: Pick<UserDto, 'id' | 'name' | 'avatarId'>;
  startedAt: string;
  speedKmh: number;
}

export interface TreadmillDto {
  id: string;
  name: string;
  maxSpeedKmh: number;
  sortOrder: number;
  busy: TreadmillBusyDto | null;
}

/** Отрезок постоянной скорости внутри прогулки (п. 6.3). */
export interface WalkSpeedSegmentDto {
  speedKmh: number;
  /** ISO — момент, с которого действует эта скорость. */
  startedAt: string;
}

export interface ActiveWalkDto {
  id: string;
  userId: string;
  treadmillId: string;
  treadmillName: string;
  /** ISO. Источник истины для таймера: клиент считает `Date.now() − startedAt`. */
  startedAt: string;
  /** Текущая скорость — последний отрезок из `speedSegments`. */
  speedKmh: number;
  /** Потолок дорожки: выше него «+» на экране прогулки не поднимает (п. 6.9.3). */
  treadmillMaxSpeedKmh: number;
  /**
   * Все отрезки скорости по возрастанию времени; первый начинается в `startedAt`.
   * По ним считается набежавшая дистанция: смена скорости не переписывает прошлое.
   */
  speedSegments: WalkSpeedSegmentDto[];
  user: UserDto;
}

export type WalkStatus = 'active' | 'finished' | 'cancelled';

export interface WalkDto {
  id: string;
  userId: string;
  treadmillId: string;
  treadmillName: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  distanceKm: number | null;
  /** Скорость старта: даже если её меняли на ходу, это число не переписывается. */
  speedKmh: number;
  status: WalkStatus;
  /** Можно ли ещё удалить запись (15-минутное окно, п. 7.7). */
  canDelete: boolean;
}

export interface StreakDto {
  /** Длина серии в рабочих днях. */
  days: number;
  /** Осталось заморозок в текущем календарном месяце. */
  freezesLeft: number;
  /** Серия была спасена заморозкой при последнем расчёте. */
  frozen: boolean;
}

export interface AchievementDto {
  code: string;
  title: string;
  description: string;
  /** ISO либо null, если ещё не получено. */
  earnedAt: string | null;
}

export interface PersonalRecordDto {
  /** Лучший день по километрам за всё время. */
  bestDayKm: number;
  /** Рекорд побит только что. */
  isNew: boolean;
}

/** Ответ `POST /api/walks/:id/finish` — экран успеха рисуется без второго запроса. */
export interface FinishWalkResultDto {
  walk: WalkDto;
  newAchievements: AchievementDto[];
  streak: StreakDto;
  personalRecord: PersonalRecordDto;
  /** Позиция в недельном рейтинге до и после прогулки. */
  rank: { current: number; previous: number | null };
  teamProgress: TeamProgressDto;
}

export interface LeaderboardRowDto {
  rank: number;
  user: Pick<UserDto, 'id' | 'name' | 'avatarId'>;
  totalKm: number;
  walksCount: number;
  totalDurationSec: number;
  avgSpeedKmh: number;
  streakDays: number;
  lastWalkAt: string | null;
}

export interface LeaderboardDto {
  period: Period | 'custom';
  rows: LeaderboardRowDto[];
  /** Всегда за всё время, независимо от периода (п. 5.3). */
  teamTotalKm: number;
}

export interface StatsDto {
  teamTotalKm: number;
  walksCount: number;
  usersCount: number;
  /** Список: активных прогулок столько, сколько занятых дорожек (п. 7.2). */
  activeWalks: ActiveWalkDto[];
}

export interface HintDto {
  id: string;
  tone: HintTone;
  text: string;
  source: 'llm' | 'static';
}

export interface HintsResponseDto {
  hints: HintDto[];
  generatedAt: string | null;
}

export interface RouteCityDto {
  city: string;
  km: number;
}

export interface TeamProgressDto {
  totalKm: number;
  /** Последний пройденный город. */
  passed: RouteCityDto;
  /** Следующий город; null — маршрут пройден целиком. */
  next: RouteCityDto | null;
  kmLeft: number;
  /** Доля пути между `passed` и `next`, 0…1 — ширина полосы прогресса. */
  progressRatio: number;
  route: RouteCityDto[];
}

export interface UserStatsDto {
  user: UserDto;
  streak: StreakDto;
  personalRecord: { bestDayKm: number; bestWalkKm: number };
  totalKm: number;
  walksCount: number;
  /** Позиция в недельном рейтинге. */
  rank: number | null;
  achievements: AchievementDto[];
  /** Скорость последней прогулки — для предвыбора (п. 6.2). */
  lastSpeedKmh: number | null;
  lastTreadmillId: string | null;
}
