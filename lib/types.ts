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

/** Telegram status for the participant card and the invite panel (spec § 6.10.2). */
export interface TelegramStatusDto {
  /** The subsystem is enabled on the server (bot token present, kill switch up). */
  enabled: boolean;
  linked: boolean;
  /** "Don't show again" was pressed; the panel is visible when `enabled && !linked && !dismissed`. */
  dismissed: boolean;
}

/** Response of `POST /api/users/:id/telegram/link-token` (spec § 6.10.3). */
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
 * A treadmill row on the settings screen (spec § 6.11.2): unlike `TreadmillDto`
 * it includes inactive treadmills and the data the admin actions depend on —
 * `walksCount` decides between "delete" and "deactivate" (spec § 6.11.4).
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

/** A constant-speed segment inside a walk (spec § 6.3). */
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
  /** Treadmill ceiling: "+" on the walk screen never goes above it (spec § 6.9.3). */
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
  /** Whether the record can still be deleted (15-minute window, spec § 7.7). */
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

export interface LeaderboardDto {
  period: Period | 'custom';
  rows: LeaderboardRowDto[];
  /** Always all-time, regardless of the period (spec § 5.3). */
  teamTotalKm: number;
}

export interface StatsDto {
  teamTotalKm: number;
  walksCount: number;
  usersCount: number;
  /** A list: there are as many active walks as busy treadmills (spec § 7.2). */
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

/** Decor glyph kinds of the pixel map — a fixed catalog (spec § 6.12.5). */
export type MapDecorKind = 'tree' | 'mountain' | 'lake' | 'house' | 'anchor';

/**
 * Pixel-map layout (spec § 6.12.5): integer coordinates on the MAP_GRID_W ×
 * MAP_GRID_H grid. Produced by the LLM (validated + normalized) or, when
 * absent, built deterministically by `fallbackLayout`.
 */
export interface MapLayoutDto {
  cities: Array<{ city: string; x: number; y: number }>;
  /** Optional trail bends between a city and the next one. */
  bends: Array<{ after: string; x: number; y: number }>;
  decor: Array<{ kind: MapDecorKind; x: number; y: number }>;
}

/** A route row on the settings screen (spec § 6.12.3). */
export interface RouteAdminDto {
  id: string;
  name: string;
  baseKm: number;
  isActive: boolean;
  points: RouteCityDto[];
  hasMapLayout: boolean;
  /** A generated background picture is stored (spec § 6.12.5). */
  hasMapImage: boolean;
  /** Present only on the active route: km walked on it and what is next. */
  progress: { walkedKm: number; nextCity: string | null; kmLeft: number } | null;
}

/** Response of `GET /api/routes` (spec § 5.6). */
export interface RoutesAdminResponseDto {
  routes: RouteAdminDto[];
  /** LLM credentials are configured — the AI generation UI is shown (spec § 6.12.4). */
  llmEnabled: boolean;
}

/** Draft returned by `POST /api/routes/generate` — never written to the DB. */
export interface RouteDraftDto {
  name: string;
  points: RouteCityDto[];
}

export interface TeamProgressDto {
  /**
   * Km walked on the active route: `teamTotalKm − base_km` (spec § 6.12.1).
   * With the seeded route (`base_km = 0`) it equals the all-time team total.
   */
  totalKm: number;
  /** The last city passed. */
  passed: RouteCityDto;
  /** The next city; null — the route is fully completed. */
  next: RouteCityDto | null;
  kmLeft: number;
  /** Fraction of the way between `passed` and `next`, 0…1 — progress bar width. */
  progressRatio: number;
  route: RouteCityDto[];
  /** Pixel-map layout of the active route, null → deterministic fallback (spec § 6.12.5). */
  mapLayout: MapLayoutDto | null;
  /**
   * Versioned URL of the map background (`GET /api/routes/:id/image?v=…`),
   * null → the SVG-only map. Only the URL travels here: the progress endpoint
   * is polled and must not carry the image itself (spec § 6.12.5).
   */
  mapImageUrl: string | null;
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
  /** Speed of the last walk — for preselection (spec § 6.2). */
  lastSpeedKmh: number | null;
  lastTreadmillId: string | null;
}
