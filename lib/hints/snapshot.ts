import { and, eq, sql } from 'drizzle-orm';

import { HINTS_NEWCOMER_DAYS, TZ } from '@/lib/config';
import { db } from '@/lib/db';
import { users, walks } from '@/lib/db/schema';
import { positionOnRoute } from '@/lib/hints/route';
import { diffOfficeDays, toOfficeDay } from '@/lib/time';

/**
 * Обезличенный снапшот для LLM (п. 6.6.2 ТЗ).
 *
 * В модель уходит не список сотрудников, а слоты `u1…uN`. Это закрывает сразу
 * четыре проблемы: персональные данные не покидают периметр (бесплатные тарифы
 * учатся на промптах, п. 6.6.1); участник с `hints_opt_out` просто не попадает
 * в снапшот; при смене имени старые хинты не протухают; модель физически не может
 * переврать имя, потому что его не видит.
 */

export interface HintSnapshotParticipant {
  slot: string;
  rank: number;
  total_km: number;
  walks: number;
  streak_days?: number;
  days_since_last: number | null;
  usual_speed: number | null;
}

export interface HintSnapshot {
  team_total_km: number;
  /** Арифметику по маршруту делаем мы: на числах LLM ошибается охотнее всего. */
  route_position: { passed: string; next: string | null; km_left: number };
  participants: HintSnapshotParticipant[];
}

export interface SnapshotResult {
  snapshot: HintSnapshot;
  /** Слот → id участника: по нему подставляем имена и заполняем `subject_id`. */
  slotToUserId: Map<string, string>;
  /** Слот → имя: подстановка `{{uN}}` происходит на нашей стороне. */
  slotToName: Map<string, string>;
  /** Новичков не подкалываем (п. 6.6.7); флаг в модель не уходит. */
  newcomerSlots: Set<string>;
}

/** Сколько участников влезает в промпт: топ рейтинга плюс самые «залежавшиеся». */
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
  /** Офисные даты прогулок, по убыванию. */
  days: string[];
}

/**
 * Одна агрегация по всем участникам. `hints_opt_out` здесь не отсекаем:
 * место в рейтинге должно оставаться настоящим, иначе шутки про «второго»
 * будут врать. Исключение происходит уже после расчёта рангов.
 */
async function loadUsers(): Promise<AggregatedUser[]> {
  // TZ — константа из конфига, не пользовательский ввод: `sql.raw` здесь безопасен,
  // а параметр-плейсхолдер в `at time zone` Postgres не может вывести по типу.
  const officeDay = sql.raw(`at time zone '${TZ}'`);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      hintsOptOut: users.hintsOptOut,
      createdAt: users.createdAt,
      totalKm: sql<string>`coalesce(sum(${walks.distanceKm}), 0)`,
      walksCount: sql<number>`count(${walks.id})::int`,
      // Обычная скорость = самая частая, а не средняя: «ходит на 6 км/ч» звучит
      // осмысленно только если это реальная кнопка на дорожке.
      usualSpeed: sql<number | null>`mode() within group (order by ${walks.speedKmh})`,
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
    days: (row.days ?? '')
      .split(',')
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a)),
  }));
}

/**
 * Серия берётся из того же модуля, что и лидерборд (`lib/game/streak.ts`).
 * Своя «грубая» формула здесь была бы дешевле, но давала бы другое число:
 * без учёта заморозок хинт написал бы «серия 3 дня» рядом с таблицей,
 * где у того же человека 7 — и доверия к ленте не осталось бы.
 */
async function loadStreakDays(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  try {
    const { getStreakDaysBulk } = await import('@/lib/game/streak');
    return await getStreakDaysBulk(userIds);
  } catch (error) {
    console.error('[hints] не удалось получить серии, снапшот без них', error);
    return new Map();
  }
}

export async function buildSnapshot(): Promise<SnapshotResult> {
  const all = await loadUsers();
  const today = toOfficeDay();
  const streaks = await loadStreakDays(all.map((user) => user.id));

  // Ранг считается по всем участникам, включая отказавшихся от хинтов.
  const ranked = [...all]
    .sort((a, b) => b.totalKm - a.totalKm || a.name.localeCompare(b.name))
    .map((user, index) => ({ user, rank: index + 1 }));

  const visible = ranked.filter((entry) => !entry.user.hintsOptOut);

  // Топ рейтинга + самые давно не ходившие: именно про них получаются шутки,
  // а середина таблицы всё равно не влезет в разумный промпт.
  const top = visible.slice(0, MAX_TOP);
  const rest = visible.slice(MAX_TOP);
  // Пустая строка сортируется раньше любой даты — ни разу не ходившие идут первыми.
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
    };
    if (streak > 0) participant.streak_days = streak;
    return participant;
  });

  const teamTotalKm = Math.round(all.reduce((sum, u) => sum + u.totalKm, 0) * 100) / 100;
  const position = positionOnRoute(teamTotalKm);

  return {
    snapshot: {
      team_total_km: teamTotalKm,
      route_position: {
        passed: position.passed.city,
        next: position.next?.city ?? null,
        km_left: position.kmLeft,
      },
      participants,
    },
    slotToUserId,
    slotToName,
    newcomerSlots,
  };
}
