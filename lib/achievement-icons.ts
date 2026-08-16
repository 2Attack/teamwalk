import type { IconName } from '@/lib/icons.generated';

/**
 * Achievement icon by code. Kept separate from
 * `lib/game/achievements.ts`: that catalog pulls in the DB and is never
 * imported on the client, while the icon is purely presentational.
 */
const ACHIEVEMENT_ICONS: Record<string, IconName> = {
  first_walk: 'footprint',
  early_bird: 'bird',
  night_owl: 'owl',
  lunch_walker: 'sun',
  friday_closer: 'sunset',
  marathon: 'medal',
  zen: 'stones',
  long_haul: 'car',
  gearbox: 'gear',
  cruise: 'gauge',
  five_days: 'calendarCheck',
  ten_day_streak: 'flames',
  ten_walks: 'tally',
  fifty_walks: 'boot',
  stayer: 'lightning',
  full_throttle: 'gaugeMax',
  fifty_km: 'signpost',
  first_hundred: 'milestone',
  warm_treadmill: 'ember',
  connected: 'send',
};

/** Unknown code (catalog updated before icons) falls back to a star. */
export function achievementIcon(code: string): IconName {
  return ACHIEVEMENT_ICONS[code] ?? 'star';
}
