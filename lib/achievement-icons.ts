import type { IconName } from '@/lib/icons.generated';

/**
 * Иконка достижения по коду (п. 6.8.3). Живёт отдельно от каталога
 * `lib/game/achievements.ts`: тот тянет БД и на клиент не импортируется,
 * а иконка — чисто презентационное свойство.
 *
 * Все семь нарисованы под конкретную ачивку — `scripts/icons/*.svg`.
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

/** Незнакомый код (каталог пополнили раньше, чем иконки) — звезда. */
export function achievementIcon(code: string): IconName {
  return ACHIEVEMENT_ICONS[code] ?? 'star';
}
