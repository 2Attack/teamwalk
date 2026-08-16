/**
 * Pure computations enriching the hint snapshot (no DB).
 *
 * Same principle as `route_position`: all arithmetic — gaps, ranks,
 * forecasts — is ours; the model only quotes numbers. A wrong "u2 trails by
 * 3.4 km" next to the real table kills trust in the feed.
 */

const ROUND = (value: number): number => Math.round(value * 100) / 100;

/** Workdays per week — the "catches up in N days" pace uses them. */
const WORKDAYS_PER_WEEK = 5;

/** Beyond this horizon a forecast is fortune-telling, not a joke. */
const CATCHUP_MAX_DAYS = 60;

export interface MilestoneInfo {
  /** Nearest round milestone, a multiple of 100 km. */
  at: number;
  /** Kilometers left to it. */
  left: number;
}

/** Nearest team milestone: 12 km left to 500 — who finishes it? */
export function nextMilestone(totalKm: number): MilestoneInfo {
  const at = Math.max(100, Math.ceil(totalKm / 100) * 100);
  // Exactly on a milestone — aim for the next one: "0 left" makes no joke.
  const target = at === totalKm ? at + 100 : at;
  return { at: target, left: ROUND(target - totalKm) };
}

export interface RankChangeInput {
  id: string;
  name: string;
  totalKm: number;
  kmWeek: number;
}

/**
 * Rank change over the week: rank by "total minus week" vs rank now.
 * Positive — climbed. Same tie-break as the leaderboard: name.
 */
export function rankChanges(input: readonly RankChangeInput[]): Map<string, number> {
  const byTotal = [...input].sort(
    (a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name),
  );
  const byPrev = [...input].sort(
    (a, b) => b.totalKm - b.kmWeek - (a.totalKm - a.kmWeek) || a.name.localeCompare(b.name),
  );
  const prevRank = new Map(byPrev.map((user, index) => [user.id, index + 1]));

  return new Map(
    byTotal.map((user, index) => [user.id, (prevRank.get(user.id) ?? index + 1) - (index + 1)]),
  );
}

/**
 * Working days until the chaser catches the leader, both keeping this week's
 * pace. `null` — not catching up (pace not higher) or beyond the horizon:
 * "catches up in 400 days" adds no fun.
 */
export function catchupDays(
  gapKm: number,
  chaserWeekKm: number,
  leaderWeekKm: number,
): number | null {
  if (gapKm <= 0) return null;
  const gainPerDay = (chaserWeekKm - leaderWeekKm) / WORKDAYS_PER_WEEK;
  if (gainPerDay <= 0) return null;
  const days = Math.ceil(gapKm / gainPerDay);
  return days > CATCHUP_MAX_DAYS ? null : days;
}
