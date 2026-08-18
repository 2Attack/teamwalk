import { APP_NAME, STALE_WALK_HOURS } from '@/lib/config';
import { formatDuration, formatKm } from '@/lib/format';
import { LOCALE } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

import { en } from './texts/en';
import { es } from './texts/es';
import { ru } from './texts/ru';

import type { TelegramTexts, TelegramUiTexts } from './texts/types';

/**
 * Telegram notification texts (TZ 6.10.4). Pure module, no DB access.
 *
 * Tone follows the hints contract (TZ 6.6): jokes about walking, the treadmill,
 * the chair and stats — never about body, weight, food, health or age. Several
 * variants per event, picked at random; no LLM in this loop — the volume is
 * small and the cost of a mistake in a DM is higher than in the shared feed.
 *
 * Locale-specific phrasing lives in `./texts/{ru,en,es}.ts` (one shared
 * interface); this module keeps all branching and delegates content to the
 * module of the active `LOCALE`.
 */

const ALL: Record<Locale, TelegramTexts> = { en, es, ru };

/** Content of the active locale. */
const t: TelegramTexts = ALL[LOCALE];

/** Short UI strings (buttons, toasts, menu labels) of the active locale. */
export const uiText: TelegramUiTexts = t.ui;

/** Random variant — tiny pools, Fisher–Yates would be overkill here. */
function pick<T>(variants: readonly T[]): T {
  return variants[Math.floor(Math.random() * variants.length)];
}

/** Walk started — silent, with an "It's not me" button (TZ 6.10.4). */
export function startText(i: { speedKmh: number; treadmillName: string }): string {
  return pick(t.startVariants(i));
}

/** Finish — the product's main message: km, time, streak, rank, achievements. */
export function finishText(i: {
  distanceKm: number;
  durationSec: number;
  avgSpeedKmh: number;
  streakDays: number;
  rankCurrent: number;
  rankPrevious: number | null;
  achievements: string[];
}): string {
  const lines: string[] = [];

  let stats = t.finishStats({
    distance: formatKm(i.distanceKm),
    duration: formatDuration(i.durationSec),
    avgSpeedKmh: i.avgSpeedKmh,
  });
  if (i.streakDays > 0) stats += t.finishStreakTail(i.streakDays);
  lines.push(stats);

  // Mention the rank only when there is something to be proud of: a drop in
  // the leaderboard gets no commentary.
  if (i.rankPrevious !== null && i.rankCurrent < i.rankPrevious) {
    lines.push(t.rankUpLine(i.rankCurrent));
  }

  for (const title of i.achievements) {
    lines.push(t.achievementLine(title));
  }

  lines.push(pick(t.finishClosingVariants));

  return lines.join('\n');
}

/** Autoclose (TZ 7.6): distance was not recorded — the person must know at once. */
export function autocloseText(): string {
  return pick(t.autocloseVariants(STALE_WALK_HOURS));
}

/** "was busy for 40 minutes" / "1 h 20 min"; null — under a minute, phrase omitted. */
function busyFor(busySec: number): string | null {
  // floor, not round: 40 seconds is not "1 minute" yet — omitting is more honest.
  const min = Math.floor(busySec / 60);
  if (min < 1) return null;
  if (min < 60) return t.busyMinutes(min);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? t.busyHoursMinutes(h, m) : t.busyHoursExact(h);
}

/**
 * "Treadmill freed up" (TZ 6.10.4): a perishable event, worded as "just freed
 * up" rather than "is free now" — it is a nudge, not a reservation.
 */
export function freeText(i: { treadmillName: string; busySec: number }): string {
  const busy = busyFor(i.busySec);
  const busyTail = busy !== null ? t.busyTail(busy) : '';
  return pick(t.freeVariants({ treadmillName: i.treadmillName, busyTail }));
}

/** "No free treadmills left" — the mirror of `freeText`, count-neutral. */
export function allBusyText(): string {
  return pick(t.allBusyVariants);
}

/**
 * "Time to stretch" reminder (TZ 6.10.4): the text must give a concrete reason,
 * not state guilt. A streak at risk is game mechanics; "you haven't walked for
 * N days" is a timesheet — not allowed.
 */
export function remindText(i: {
  idleWorkdays: number;
  streakDays: number;
  freezesLeft: number;
}): string {
  if (i.streakDays > 0) return pick(t.remindStreakVariants(i));
  return pick(t.remindIdleVariants(i.idleWorkdays));
}

/** Weekly digest — Mondays, silent (TZ 6.10.4). */
export function digestText(i: {
  weekKm: number;
  /** null — no route selected (TZ 6.12.6): the digest skips geography. */
  passedCity: string | null;
  top: Array<{ name: string; km: number }>;
  selfRank: number | null;
  selfKm: number;
}): string {
  const lines: string[] = [];
  const weekKm = formatKm(i.weekKm);

  lines.push(
    i.passedCity === null
      ? pick(t.digestHeadVariants(weekKm))
      : pick(t.digestHeadCityVariants(weekKm, i.passedCity)),
  );

  if (i.top.length > 0) {
    lines.push(t.digestTopLine(i.top.map((x) => `${x.name} ${formatKm(x.km)}`).join(' · ')));
  }

  if (i.selfRank !== null) {
    lines.push(t.digestSelfLine(i.selfRank, formatKm(i.selfKm)));
  } else {
    lines.push(pick(t.digestSelfZeroVariants));
  }

  return lines.join('\n');
}

/** Greeting after linking: what will arrive and how to control it. */
export function welcomeText(name: string): string {
  return [pick(t.welcomeHelloVariants(name)), '', ...t.welcomeBodyLines].join('\n');
}

/** Sent to the displaced chat on relink (TZ 6.10.3). */
export function relinkedText(name: string): string {
  return pick(t.relinkedVariants(name));
}

/** Reply to unrecognized messages in a linked chat. */
export function helpText(): string {
  return t.helpLines(APP_NAME).join('\n');
}

/** Farewell after `/stop`. */
export function farewellText(): string {
  return pick(t.farewellVariants);
}

/** Achievement granted outside a finish (e.g. "Connected" on linking). */
export function achievementUnlockedText(title: string): string {
  return t.achievementUnlocked(title);
}

/** Reused or expired linking token (TZ 6.10.3). */
export function staleTokenText(): string {
  return pick(t.staleTokenVariants);
}
