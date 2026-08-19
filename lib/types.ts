/**
 * API DTOs — the shared contract between Route Handlers and the UI.
 * Everything sent to the client is described here; numbers are already numbers,
 * dates are ISO strings.
 */
import type { HintTone, Period, PeriodSelection } from './validation';

export type { HintTone, Period, PeriodSelection };

export interface UserDto {
  id: string;
  name: string;
  avatarId: string;
  hintsOptOut: boolean;
}

/** Telegram status for the participant card and the invite panel. */
export interface TelegramStatusDto {
  /** The subsystem is enabled on the server (bot token present, kill switch up). */
  enabled: boolean;
  linked: boolean;
  /** "Don't show again" was pressed; the panel is visible when `enabled && !linked && !dismissed`. */
  dismissed: boolean;
}

/** Response of `POST /api/users/:id/telegram/link-token`. */
export interface TelegramLinkTokenDto {
  /** `https://t.me/<bot>?start=<token>` */
  url: string;
  expiresAt: string;
}

/** Who occupies the treadmill right now. `null` — free. */
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

/**
 * A treadmill row on the settings screen: unlike `TreadmillDto`
 * it includes inactive treadmills and the data the admin actions depend on —
 * `walksCount` decides between "delete" and "deactivate".
 */
export interface TreadmillAdminDto {
  id: string;
  name: string;
  maxSpeedKmh: number;
  sortOrder: number;
  isActive: boolean;
  /** Walks of any status referencing this treadmill; > 0 forbids deletion. */
  walksCount: number;
  busy: TreadmillBusyDto | null;
}

/** A constant-speed segment inside a walk. */
export interface WalkSpeedSegmentDto {
  speedKmh: number;
  /** ISO — the moment this speed takes effect. */
  startedAt: string;
}

export interface ActiveWalkDto {
  id: string;
  userId: string;
  treadmillId: string;
  treadmillName: string;
  /** ISO. Source of truth for the timer: the client computes `Date.now() − startedAt`. */
  startedAt: string;
  /** Current speed — the last segment of `speedSegments`. */
  speedKmh: number;
  /** Treadmill ceiling: "+" on the walk screen never goes above it. */
  treadmillMaxSpeedKmh: number;
  /**
   * All speed segments in chronological order; the first starts at `startedAt`.
   * The accrued distance is computed from them: a speed change never rewrites
   * the past.
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
  /** Start speed: even if changed mid-walk, this number is never rewritten. */
  speedKmh: number;
  status: WalkStatus;
  /** Whether the record can still be deleted (15-minute window). */
  canDelete: boolean;
}

export interface StreakDto {
  /** Streak length in workdays. */
  days: number;
  /** Freezes left in the current calendar month. */
  freezesLeft: number;
  /** The streak was saved by a freeze during the last computation. */
  frozen: boolean;
}

export interface AchievementDto {
  code: string;
  title: string;
  description: string;
  /** ISO, or null if not earned yet. */
  earnedAt: string | null;
}

export interface PersonalRecordDto {
  /** Best day by kilometers of all time. */
  bestDayKm: number;
  /** The record was just beaten. */
  isNew: boolean;
}

/** Response of `POST /api/walks/:id/finish` — the success screen renders without a second request. */
export interface FinishWalkResultDto {
  walk: WalkDto;
  newAchievements: AchievementDto[];
  streak: StreakDto;
  personalRecord: PersonalRecordDto;
  /** Position in the weekly leaderboard before and after the walk. */
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

/** One office day of one participant; derived from finished walks. */
export interface DailyStatDto {
  /** Office day, `YYYY-MM-DD`. */
  day: string;
  km: number;
  durationSec: number;
  walksCount: number;
}

/** `GET /api/users/:id/daily` — continuous series, oldest first. */
export interface UserDailyStatsDto {
  user: UserDto;
  days: DailyStatDto[];
}

export interface LeaderboardDto {
  period: Period | 'custom';
  rows: LeaderboardRowDto[];
  /** Always all-time, regardless of the period. */
  teamTotalKm: number;
}

export interface StatsDto {
  teamTotalKm: number;
  walksCount: number;
  usersCount: number;
  /** A list: there are as many active walks as busy treadmills. */
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

/** A route row on the settings screen. */
export interface RouteAdminDto {
  id: string;
  name: string;
  baseKm: number;
  isActive: boolean;
  points: RouteCityDto[];
  /** Present only on the active route: km walked on it and what is next. */
  progress: { walkedKm: number; nextCity: string | null; kmLeft: number } | null;
}

/** Response of `GET /api/routes`. */
export interface RoutesAdminResponseDto {
  routes: RouteAdminDto[];
  /** LLM credentials are configured — the AI generation UI is shown. */
  llmEnabled: boolean;
}

/** Draft returned by `POST /api/routes/generate` — never written to the DB. */
export interface RouteDraftDto {
  name: string;
  points: RouteCityDto[];
}

export interface TeamProgressDto {
  /**
   * Km walked on the active route: `teamTotalKm − base_km`;
   * the raw all-time total when no route is selected.
   */
  totalKm: number;
  /** The last city passed; null — no route selected (`route` is empty too). */
  passed: RouteCityDto | null;
  /** The next city; null — the route is fully completed (or not selected). */
  next: RouteCityDto | null;
  kmLeft: number;
  /** Fraction of the way between `passed` and `next`, 0…1 — progress bar width. */
  progressRatio: number;
  route: RouteCityDto[];
}

export interface UserStatsDto {
  user: UserDto;
  streak: StreakDto;
  personalRecord: { bestDayKm: number; bestWalkKm: number };
  totalKm: number;
  walksCount: number;
  /** Position in the weekly leaderboard. */
  rank: number | null;
  achievements: AchievementDto[];
  /** Speed of the last walk — for preselection. */
  lastSpeedKmh: number | null;
  lastTreadmillId: string | null;
}

/** `POST /api/pin` success — the unlock cookie rides on the response. */
export interface PinVerifyResponseDto {
  ok: true;
}
