import { and, eq, sql } from 'drizzle-orm';

import { HINTS_NEWCOMER_DAYS, TZ } from '@/lib/config';
import { db } from '@/lib/db';
import { users, walks } from '@/lib/db/schema';
import { catchupDays, nextMilestone, rankChanges } from '@/lib/hints/enrich';
import type { MilestoneInfo } from '@/lib/hints/enrich';
import { getActiveRoute } from '@/lib/db/queries/routes';
import { positionOnRoute } from '@/lib/hints/route';
import { diffOfficeDays, periodStart, toOfficeDay } from '@/lib/time';

/**
 * Anonymized snapshot for the LLM (spec § 6.6.2).
 *
 * The model sees slots `u1…uN`, not employee names. This keeps personal data
 * inside the perimeter (free tiers train on prompts, spec § 6.6.1), lets
 * `hints_opt_out` users simply not appear, keeps old hints valid after a
 * rename, and makes it impossible for the model to garble a name it never sees.
 */

export interface HintSnapshotParticipant {
  slot: string;
  rank: number;
  total_km: number;
  walks: number;
  streak_days?: number;
  days_since_last: number | null;
  usual_speed: number | null;
  /** Gap to the participant one place above; absent for the leader. */
  gap_ahead_km?: number;
  /** Kilometers since Monday. */
  km_week: number;
  /** Rank change over the week: +2 — climbed two places. Zero is omitted. */
  rank_change?: number;
  /** Personal single-walk record. Zero (never walked) is omitted. */
  best_walk_km?: number;
}

export interface HintSnapshot {
  team_total_km: number;
  team_km_week: number;
  /** Route arithmetic is ours — numbers are where the LLM slips most.
   * Absent when no route is selected (spec § 6.12.6): geo phrases simply never appear. */
  route_position?: { passed: string; next: string | null; km_left: number };
  /** Nearest round team milestone — a ready-made "who finishes it" storyline. */
  next_milestone: MilestoneInfo;
  /** Best team day in history; absent until there are walks. */
  record_day?: { day: string; km: number };
  /** "u2 catches u1 in N working days at this week's pace" — only when catching up. */
  catchup?: { chaser: string; leader: string; days: number };
  participants: HintSnapshotParticipant[];
}

export interface SnapshotResult {
  snapshot: HintSnapshot;
  /** Slot → user id: used for name substitution and `subject_id`. */
  slotToUserId: Map<string, string>;
  /** Slot → name: `{{uN}}` substitution happens on our side. */
  slotToName: Map<string, string>;
  /** Newcomers are never teased (spec § 6.6.7); the flag never reaches the model. */
  newcomerSlots: Set<string>;
}

/** Prompt capacity: leaderboard top plus the longest-idle participants. */
const MAX_TOP = 12;
const MAX_INACTIVE = 8;

interface AggregatedUser {
  id: string;
  name: string;
  hintsOptOut: boolean;
  createdAt: Date;
  totalKm: number;
  walksCount: number;
  usualSpeed: number | null;
  kmWeek: number;
  bestWalkKm: number;
  /** Office days with walks, descending. */
  days: string[];
}

/**
 * One aggregation over all participants. `hints_opt_out` users are kept:
 * ranks must stay real, or jokes about "second place" would lie. They are
 * excluded only after ranks are computed.
 */
async function loadUsers(weekStart: Date): Promise<AggregatedUser[]> {
  // TZ is a config constant, not user input: `sql.raw` is safe here, and
  // Postgres cannot type-infer a bound placeholder inside `at time zone`.
  const officeDay = sql.raw(`at time zone '${TZ}'`);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      hintsOptOut: users.hintsOptOut,
      createdAt: users.createdAt,
      totalKm: sql<string>`coalesce(sum(${walks.distanceKm}), 0)`,
      walksCount: sql<number>`count(${walks.id})::int`,
      // Usual speed = the most frequent one, not the average: "walks at 6 km/h"
      // only makes sense if it is an actual treadmill button.
      usualSpeed: sql<number | null>`mode() within group (order by ${walks.speedKmh})`,
      kmWeek: sql<string>`coalesce(sum(${walks.distanceKm}) filter (where ${walks.startedAt} >= ${weekStart}), 0)`,
      bestWalkKm: sql<string>`coalesce(max(${walks.distanceKm}), 0)`,
      days: sql<
        string | null
      >`string_agg(distinct to_char(${walks.startedAt} ${officeDay}, 'YYYY-MM-DD'), ',')`,
    })
    .from(users)
    .leftJoin(walks, and(eq(walks.userId, users.id), eq(walks.status, 'finished')))
    .groupBy(users.id);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    hintsOptOut: row.hintsOptOut,
    createdAt: new Date(row.createdAt),
    totalKm: Number(row.totalKm),
    walksCount: Number(row.walksCount),
    usualSpeed: row.usualSpeed === null ? null : Number(row.usualSpeed),
    kmWeek: Number(row.kmWeek),
    bestWalkKm: Number(row.bestWalkKm),
    days: (row.days ?? '')
      .split(',')
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a)),
  }));
}

/** All-time best team day — office date and total kilometers. */
async function loadRecordDay(): Promise<{ day: string; km: number } | null> {
  const officeDay = sql.raw(`at time zone '${TZ}'`);
  const rows = await db
    .select({
      day: sql<string>`to_char(${walks.startedAt} ${officeDay}, 'YYYY-MM-DD')`,
      km: sql<string>`sum(${walks.distanceKm})`,
    })
    .from(walks)
    .where(eq(walks.status, 'finished'))
    .groupBy(sql`1`)
    .orderBy(sql`2 desc`)
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return { day: row.day, km: Math.round(Number(row.km) * 100) / 100 };
}

/**
 * Streaks come from the same module as the leaderboard (`lib/game/streak.ts`).
 * A cheaper local formula would ignore freezes and show a different number
 * than the table next to it — killing trust in the feed.
 */
async function loadStreakDays(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  try {
    const { getStreakDaysBulk } = await import('@/lib/game/streak');
    return await getStreakDaysBulk(userIds);
  } catch (error) {
    console.error('[hints] failed to load streaks, snapshot goes without them', error);
    return new Map();
  }
}

export async function buildSnapshot(): Promise<SnapshotResult> {
  const all = await loadUsers(periodStart('week'));
  const today = toOfficeDay();
  const [streaks, recordDay] = await Promise.all([
    loadStreakDays(all.map((user) => user.id)),
    loadRecordDay(),
  ]);
  const changes = rankChanges(all);

  // Ranks are computed over all participants, opt-outs included.
  const ranked = [...all]
    .sort((a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name))
    .map((user, index) => ({ user, rank: index + 1 }));

  const visible = ranked.filter((entry) => !entry.user.hintsOptOut);

  // Leaderboard top + longest idle: that is where the jokes are, and the
  // middle of the table would not fit a reasonable prompt anyway.
  const top = visible.slice(0, MAX_TOP);
  const rest = visible.slice(MAX_TOP);
  // An empty string sorts before any date — never-walked users come first.
  const inactive = [...rest]
    .sort((a, b) => (a.user.days[0] ?? '').localeCompare(b.user.days[0] ?? ''))
    .slice(0, MAX_INACTIVE);

  const selected = [...top, ...inactive].sort((a, b) => a.rank - b.rank);

  const slotToUserId = new Map<string, string>();
  const slotToName = new Map<string, string>();
  const newcomerSlots = new Set<string>();

  const participants = selected.map((entry, index) => {
    const slot = `u${index + 1}`;
    const { user } = entry;
    slotToUserId.set(slot, user.id);
    slotToName.set(slot, user.name);

    const ageDays = diffOfficeDays(today, toOfficeDay(user.createdAt));
    if (ageDays < HINTS_NEWCOMER_DAYS) newcomerSlots.add(slot);

    const lastDay = user.days[0] ?? null;
    const streak = streaks.get(user.id) ?? 0;

    const participant: HintSnapshotParticipant = {
      slot,
      rank: entry.rank,
      total_km: Math.round(user.totalKm * 100) / 100,
      walks: user.walksCount,
      days_since_last: lastDay ? diffOfficeDays(today, lastDay) : null,
      usual_speed: user.usualSpeed,
      km_week: Math.round(user.kmWeek * 100) / 100,
    };
    if (streak > 0) participant.streak_days = streak;

    // The gap is to the real neighbor above (who may be opted out: numbers
    // are anonymized and they have no slot, so nothing leaks).
    const ahead = ranked[entry.rank - 2];
    if (ahead) {
      participant.gap_ahead_km = Math.round((ahead.user.totalKm - user.totalKm) * 100) / 100;
    }

    const change = changes.get(user.id) ?? 0;
    if (change !== 0) participant.rank_change = change;
    if (user.bestWalkKm > 0) {
      participant.best_walk_km = Math.round(user.bestWalkKm * 100) / 100;
    }
    return participant;
  });

  const teamTotalKm = Math.round(all.reduce((sum, u) => sum + u.totalKm, 0) * 100) / 100;
  const teamKmWeek = Math.round(all.reduce((sum, u) => sum + u.kmWeek, 0) * 100) / 100;
  // The route lives in the DB since spec § 6.12; the position is projected
  // from the km walked on the active route, not the raw all-time total.
  // No route selected → the geo position is simply omitted from the snapshot.
  const activeRoute = await getActiveRoute();
  const position =
    activeRoute.points.length >= 2
      ? positionOnRoute(activeRoute.points, Math.max(0, teamTotalKm - activeRoute.baseKm))
      : null;

  const snapshot: HintSnapshot = {
    team_total_km: teamTotalKm,
    team_km_week: teamKmWeek,
    next_milestone: nextMilestone(teamTotalKm),
    participants,
  };
  if (position) {
    snapshot.route_position = {
      passed: position.passed.city,
      next: position.next?.city ?? null,
      km_left: position.kmLeft,
    };
  }
  if (recordDay) snapshot.record_day = recordDay;

  // The chase storyline covers only the top pair of visible participants:
  // both need slots, otherwise there is no name to substitute into the joke.
  const [leader, chaser] = visible;
  const leaderSlot = participants[selected.indexOf(leader)]?.slot;
  const chaserSlot = participants[selected.indexOf(chaser)]?.slot;
  if (leader && chaser && leaderSlot && chaserSlot) {
    const days = catchupDays(
      leader.user.totalKm - chaser.user.totalKm,
      chaser.user.kmWeek,
      leader.user.kmWeek,
    );
    if (days !== null) {
      snapshot.catchup = { chaser: chaserSlot, leader: leaderSlot, days };
    }
  }

  return { snapshot, slotToUserId, slotToName, newcomerSlots };
}
