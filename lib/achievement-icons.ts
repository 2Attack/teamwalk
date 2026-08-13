import type { IconName } from '@/lib/icons.generated';

/**
 * Иконка достижения по коду (п. 6.8.3). Живёт отдельно от каталога
 * `lib/game/achievements.ts`: тот тянет БД и на клиент не импортируется,
 * а иконка — чисто презентационное свойство.
 *
 * Все семь нарисованы под конкретную ачивку — `scripts/icons/*.svg`.
 */
const ACHIEVEMENT_ICONS: Record<string, IconName> = {
  early_bird: 'bird',
  night_owl: 'owl',
  marathon: 'medal',
  five_days: 'calendarCheck',
  stayer: 'lightning',
  first_hundred: 'milestone',
  warm_treadmill: 'ember',
};

/** Незнакомый код (каталог пополнили раньше, чем иконки) — звезда. */
export function achievementIcon(code: string): IconName {
  return ACHIEVEMENT_ICONS[code] ?? 'star';
}
