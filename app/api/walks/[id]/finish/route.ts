import { waitUntil } from '@vercel/functions';
import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { apiError, handle, readJson, validationError, type ApiErrorBody } from '@/lib/api';
import { db } from '@/lib/db';
import { getUserRank } from '@/lib/db/queries/leaderboard';
import { getWalkById } from '@/lib/db/queries/walks';
import { walks } from '@/lib/db/schema';
import { awardAchievements } from '@/lib/game/achievements';
import { getPersonalRecord, getTeamProgress } from '@/lib/game/progress';
import { getStreak } from '@/lib/game/streak';
import {
  notifyTreadmillFreed,
  notifyWalkFinished,
  wereAllTreadmillsBusy,
} from '@/lib/telegram/notify';
import type { FinishWalkResultDto, TeamProgressDto, WalkDto } from '@/lib/types';
import { finishWalkSchema, uuidSchema } from '@/lib/validation';
import { m } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Геймификация не имеет права уронить уже сохранённую прогулку (п. 7.3, 8). */
async function safe<T>(run: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[walks] finish: ${label} failed`, error);
    return fallback;
  }
}

function fallbackProgress(): TeamProgressDto {
  return { totalKm: 0, passed: null, next: null, kmLeft: 0, progressRatio: 0, route: [] };
}

/** Сводка для экрана успеха: собирается без второго запроса от клиента (п. 6.8.6). */
async function buildResult(walk: WalkDto, previousRank: number | null): Promise<FinishWalkResultDto> {
  const [newAchievements, streak, before, after, teamProgress, rank] = await Promise.all([
    safe(() => awardAchievements(walk.userId, walk.id), [], 'awardAchievements'),
    safe(() => getStreak(walk.userId), { days: 0, freezesLeft: 0, frozen: false }, 'getStreak'),
    // Рекорд без текущей прогулки — с чем сравнивать.
    safe(() => getPersonalRecord(walk.userId, walk.id), { bestDayKm: 0, bestWalkKm: 0 }, 'record.before'),
    safe(() => getPersonalRecord(walk.userId), { bestDayKm: 0, bestWalkKm: 0 }, 'record.after'),
    safe(() => getTeamProgress(), fallbackProgress(), 'getTeamProgress'),
    safe(() => getUserRank(walk.userId, 'week'), previousRank, 'getUserRank'),
  ]);

  return {
    walk,
    newAchievements,
    streak,
    personalRecord: {
      bestDayKm: after.bestDayKm,
      isNew: after.bestDayKm > before.bestDayKm + 1e-9,
    },
    rank: { current: rank ?? previousRank ?? 0, previous: previousRank },
    teamProgress,
  };
}

/**
 * POST /api/walks/:id/finish — завершение прогулки.
 * Идемпотентно (п. 8): повтор после потери сети возвращает 200 с текущим состоянием.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return validationError(idCheck.error);

  const bodyCheck = finishWalkSchema.safeParse(await readJson(request));
  if (!bodyCheck.success) return validationError(bodyCheck.error);

  const walkId = idCheck.data;
  const { distanceKm } = bodyCheck.data;

  return handle<FinishWalkResultDto | ApiErrorBody>(async () => {
    const before = await getWalkById(walkId);
    if (!before) return apiError(404, 'NOT_FOUND', m.apiMessages.walkNotFound);
    if (before.status === 'finished') {
      return NextResponse.json(await buildResult(before, null));
    }
    if (before.status === 'cancelled') {
      return apiError(409, 'WALK_NOT_ACTIVE', m.apiMessages.walkCancelledUnsavable);
    }

    // Позицию «до» читаем строго до апдейта, иначе она уже учтёт эту прогулку.
    const previousRank = await safe(
      () => getUserRank(before.userId, 'week'),
      null as number | null,
      'getUserRank.previous',
    );

    // «Все ли дорожки заняты» — тоже до апдейта: после освобождения переход
    // «всё занято → свободно» уже не увидеть (п. 6.10.4). При выключенном
    // Telegram вернёт false без запроса к БД.
    const wasFullHouse = await wereAllTreadmillsBusy();

    // Атомарно: длительность считает сервер, статус меняется только у активной.
    const updated = await db
      .update(walks)
      .set({
        status: 'finished',
        endedAt: sql`now()`,
        durationSec: sql`greatest(0, extract(epoch from (now() - ${walks.startedAt}))::int)`,
        distanceKm: distanceKm.toFixed(2),
      })
      .where(and(eq(walks.id, walkId), eq(walks.status, 'active')))
      .returning({ id: walks.id });

    if (updated.length === 0) {
      // Ноль строк — либо параллельный повтор, либо статус успели сменить.
      const current = await getWalkById(walkId);
      if (!current) return apiError(404, 'NOT_FOUND', m.apiMessages.walkNotFound);
      if (current.status === 'finished') {
        return NextResponse.json(await buildResult(current, previousRank));
      }
      return apiError(409, 'WALK_NOT_ACTIVE', m.apiMessages.walkNotActive);
    }

    const finished = await getWalkById(walkId);
    if (!finished) {
      return apiError(500, 'INTERNAL_ERROR', m.apiMessages.walkSavedUnreadable);
    }

    const result = await buildResult(finished, previousRank);

    // Telegram никогда не в горячем пути (п. 6.10.1): уведомление о финише —
    // после ответа клиенту и только при свежем завершении; идемпотентные повторы
    // POST выше сюда не доходят, дедупликацию по `finish:<walkId>` держит notify.
    waitUntil(notifyWalkFinished(result));

    // Финиш при полностью занятых дорожках освободил одну — событие для тех,
    // кто ждал (п. 6.10.4). Дедупликация по `free:<walkId>` — внутри notify.
    if (wasFullHouse) {
      waitUntil(
        notifyTreadmillFreed({
          walkId: finished.id,
          treadmillName: finished.treadmillName,
          freedByUserId: finished.userId,
          busySec: finished.durationSec ?? 0,
        }),
      );
    }

    return NextResponse.json(result);
  });
}
