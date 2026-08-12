import { NextResponse } from 'next/server';

import {
  apiError,
  handle,
  isUniqueViolation,
  readJson,
  validationError,
  type ApiErrorBody,
} from '@/lib/api';
import { db } from '@/lib/db';
import { getActiveWalk, getTreadmillById, listActiveTreadmills } from '@/lib/db/queries/walks';
import { walks } from '@/lib/db/schema';
import { formatTimeOfDay } from '@/lib/format';
import type { ActiveWalkDto, TreadmillDto } from '@/lib/types';
import { startWalkSchema } from '@/lib/validation';
import { closeStaleWalks } from '@/lib/walks/autoclose';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Сколько раз перевыбираем свободную дорожку, проиграв гонку за неё. */
const MAX_START_ATTEMPTS = 5;

type Chosen =
  | { ok: true; treadmill: TreadmillDto }
  | { ok: false; response: ReturnType<typeof apiError> };

/** Явно выбранная дорожка: отличаем «нет такой» от «выведена из строя» (п. 6.9.6). */
async function resolveExplicit(id: string, active: TreadmillDto[]): Promise<Chosen> {
  const found = active.find((t) => t.id === id);
  if (found) return { ok: true, treadmill: found };

  const known = await getTreadmillById(id);
  if (!known) return { ok: false, response: apiError(404, 'NOT_FOUND', 'Дорожка не найдена') };

  return {
    ok: false,
    response: apiError(
      409,
      'TREADMILL_INACTIVE',
      `Дорожка «${known.name}» сейчас недоступна`,
      { field: 'treadmillId' },
    ),
  };
}

/** Дорожка не передана: одна активная подставляется сама, иначе первая свободная (п. 6.9). */
function resolveAuto(active: TreadmillDto[], skip: ReadonlySet<string> = new Set()): Chosen {
  if (active.length === 0) {
    return {
      ok: false,
      response: apiError(409, 'NO_TREADMILLS', 'Сейчас нет доступных дорожек'),
    };
  }

  // Список уже отсортирован по sort_order, name.
  const free = active.find((t) => !t.busy && !skip.has(t.id));
  if (free) return { ok: true, treadmill: free };

  return {
    ok: false,
    response: apiError(409, 'TREADMILL_BUSY', 'Все дорожки заняты, подождите освобождения', {
      details: active.map((t) => ({ treadmillId: t.id, name: t.name, busy: t.busy })),
    }),
  };
}

/**
 * Drizzle 0.45 заворачивает ошибку драйвера в `DrizzleQueryError`, у которой
 * нет `code` — код `23505` и имя индекса лежат в `cause`. Разворачиваем цепочку,
 * иначе гонка отдалась бы клиенту как 500 вместо понятного 409.
 */
function violates(error: unknown, index?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (isUniqueViolation(current, index)) return true;
    if (!(current instanceof Error) || current.cause === undefined) return false;
    current = current.cause;
  }
  return false;
}

/** 409 по п. 7.1: у участника уже есть активная прогулка — отдаём её в `details`. */
async function alreadyActive(userId: string) {
  return apiError(409, 'WALK_ALREADY_ACTIVE', 'У вас уже идёт прогулка', {
    details: await getActiveWalk(userId),
  });
}

/** 409 по п. 7.2: дорожку занял кто-то другой — отдаём имя и время начала. */
async function treadmillBusy(treadmill: TreadmillDto) {
  const busy = (await listActiveTreadmills()).find((t) => t.id === treadmill.id)?.busy ?? null;
  const message = busy
    ? `На дорожке «${treadmill.name}» сейчас ${busy.user.name}, с ${formatTimeOfDay(busy.startedAt)}`
    : `Дорожка «${treadmill.name}» только что занята`;

  return apiError(409, 'TREADMILL_BUSY', message, { field: 'treadmillId', details: busy });
}

/**
 * POST /api/walks/start — создаёт активную прогулку.
 * Конкурентные ограничения обеспечивает БД (partial unique indexes, п. 7.1–7.2),
 * а не предварительные SELECT: читать «свободно ли» перед вставкой — гонка.
 */
export async function POST(request: Request) {
  const parsed = startWalkSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { userId, speedKmh, treadmillId } = parsed.data;

  return handle<ActiveWalkDto | ApiErrorBody>(async () => {
    // Забытые прогулки освобождают дорожки до выбора (п. 7.6).
    await closeStaleWalks();

    // Своя идущая прогулка — это 7.1, а не 7.2: при одной дорожке она же её и
    // занимает, и без этой проверки участник получил бы TREADMILL_BUSY вместо
    // WALK_ALREADY_ACTIVE, а интерфейс не увёл бы его на экран своей прогулки.
    // От гонки по-прежнему защищает partial unique index, а не этот SELECT.
    const own = await getActiveWalk(userId);
    if (own) {
      return apiError(409, 'WALK_ALREADY_ACTIVE', 'У вас уже идёт прогулка', { details: own });
    }

    /*
      Дорожку выбираем с повтором: при автоподстановке двое участников, нажавших
      «Start» одновременно, читают один и тот же список и оба целятся в первую
      свободную. Проигравший гонку не должен получать «занято» — при двух
      дорожках параллельные прогулки это штатный режим (п. 7.2), поэтому он
      перевыбирает следующую свободную. Если дорожку указали явно, повтора нет:
      человек выбрал конкретный тренажёр, подменять его молча нельзя.
    */
    const failed = new Set<string>();

    for (let attempt = 0; attempt < MAX_START_ATTEMPTS; attempt += 1) {
      const active = await listActiveTreadmills();
      const chosen = treadmillId
        ? await resolveExplicit(treadmillId, active)
        : resolveAuto(active, failed);
      if (!chosen.ok) return chosen.response;

      const treadmill = chosen.treadmill;

      // Потолок скорости — свойство конкретной дорожки, CHECK его не проверяет.
      if (speedKmh > treadmill.maxSpeedKmh) {
        return apiError(
          400,
          'SPEED_OUT_OF_RANGE',
          `Для дорожки «${treadmill.name}» максимум ${treadmill.maxSpeedKmh} км/ч`,
          { field: 'speedKmh' },
        );
      }

      try {
        await db.insert(walks).values({ userId, treadmillId: treadmill.id, speedKmh });
        break;
      } catch (error) {
        if (violates(error, 'walks_one_active_per_user')) return alreadyActive(userId);

        const busyTreadmill =
          violates(error, 'walks_one_active_per_treadmill') ||
          // 23505 без опознанного индекса: раз своей прогулки нет, занята дорожка.
          (violates(error) && !(await getActiveWalk(userId)));

        if (!busyTreadmill) {
          if (violates(error)) return alreadyActive(userId);
          throw error;
        }

        failed.add(treadmill.id);
        if (treadmillId || attempt === MAX_START_ATTEMPTS - 1) return treadmillBusy(treadmill);
      }
    }

    const walk = await getActiveWalk(userId);
    if (!walk) {
      return apiError(500, 'INTERNAL_ERROR', 'Прогулка создана, но её не удалось прочитать');
    }

    return NextResponse.json(walk, { status: 201 });
  });
}
