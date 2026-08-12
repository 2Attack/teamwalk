import { NextResponse } from 'next/server';

import { apiError, handle, readJson, validationError, type ApiErrorBody } from '@/lib/api';
import { db } from '@/lib/db';
import { getActiveWalkById, getWalkById } from '@/lib/db/queries/walks';
import { walkSpeedSegments } from '@/lib/db/schema';
import type { ActiveWalkDto } from '@/lib/types';
import { changeSpeedSchema, uuidSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/walks/:id/speed — смена скорости прямо во время прогулки (п. 6.3).
 *
 * Это insert отрезка, а не update прогулки: новая скорость действует с `now()`,
 * а пройденное до неё по-прежнему считается по прежней. Переписывать
 * `walks.speed_kmh` значило бы задним числом пересчитать всю дистанцию —
 * сбросив темп в конце, человек «потерял» бы уже пройденные километры.
 *
 * Момент смены ставит сервер, а не клиент: часы планшета у дорожки могут врать,
 * а по этим отметкам считается дистанция.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idCheck = uuidSchema.safeParse(id);
  if (!idCheck.success) return validationError(idCheck.error);

  const bodyCheck = changeSpeedSchema.safeParse(await readJson(request));
  if (!bodyCheck.success) return validationError(bodyCheck.error);

  const walkId = idCheck.data;
  const { speedKmh } = bodyCheck.data;

  return handle<ActiveWalkDto | ApiErrorBody>(async () => {
    const walk = await getActiveWalkById(walkId);
    if (!walk) {
      // Разделяем «нет такой» и «уже не идёт»: экран прогулки ведёт себя по-разному.
      const known = await getWalkById(walkId);
      if (!known) return apiError(404, 'NOT_FOUND', 'Прогулка не найдена');
      return apiError(409, 'WALK_NOT_ACTIVE', 'Прогулка уже не идёт — скорость не изменить');
    }

    // Потолок — свойство конкретной дорожки, CHECK его не проверяет (как и на старте).
    if (speedKmh > walk.treadmillMaxSpeedKmh) {
      return apiError(
        400,
        'SPEED_OUT_OF_RANGE',
        `Для дорожки «${walk.treadmillName}» максимум ${walk.treadmillMaxSpeedKmh} км/ч`,
        { field: 'speedKmh' },
      );
    }

    // Та же скорость — не событие: отрезок нулевой длины только засорил бы историю.
    // Повтор запроса после потери сети приходит сюда же и получает 200 (п. 8).
    if (speedKmh === walk.speedKmh) return NextResponse.json(walk);

    await db.insert(walkSpeedSegments).values({ walkId, speedKmh });

    const updated = await getActiveWalkById(walkId);
    if (!updated) {
      // Прогулку успели закрыть параллельно: скорость записана, но отдать нечего.
      return apiError(409, 'WALK_NOT_ACTIVE', 'Прогулка только что завершилась');
    }

    return NextResponse.json(updated);
  });
}
