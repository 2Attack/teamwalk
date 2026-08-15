import { waitUntil } from '@vercel/functions';
import { and, eq, lt, sql } from 'drizzle-orm';

import { STALE_WALK_HOURS } from '@/lib/config';
import { db } from '@/lib/db';
import { treadmills, walks } from '@/lib/db/schema';
import {
  notifyAutoClosed,
  notifyTreadmillFreed,
  wereAllTreadmillsBusy,
} from '@/lib/telegram/notify';
import { uiText } from '@/lib/telegram/texts';

/**
 * Автозакрытие зависших прогулок (п. 7.6): человек забыл нажать «End walk».
 *
 * Вызывается ленивой проверкой из `/api/walks/active`, `/api/treadmills`,
 * `/api/walks/start` и лидерборда — это дешевле и надёжнее cron на Hobby-плане.
 *
 * Смена статуса выводит запись из-под partial unique index, поэтому забытая
 * прогулка перестаёт блокировать и участника, и дорожку.
 *
 * `duration_sec` проставляется (иначе непонятно, сколько дорожка была занята),
 * а дистанция — **никогда**: она неизвестна, а вывести её из скорости за 8 часов
 * значило бы записать человеку километры, которых он не проходил.
 */
export async function closeStaleWalks(): Promise<number> {
  // Константа из конфига, не пользовательский ввод — можно вклеить в литерал интервала.
  const staleInterval = sql.raw(`interval '${Number(STALE_WALK_HOURS)} hours'`);

  // До закрытия: автозакрытие при аншлаге — тоже освобождение (п. 6.10.4).
  // При выключенном Telegram вернёт false без запроса к БД.
  const wasFullHouse = await wereAllTreadmillsBusy();

  const closed = await db
    .update(walks)
    .set({
      status: 'cancelled',
      endedAt: sql`now()`,
      durationSec: sql`greatest(0, extract(epoch from (now() - ${walks.startedAt}))::int)`,
    })
    .where(and(eq(walks.status, 'active'), lt(walks.startedAt, sql`now() - ${staleInterval}`)))
    .returning({
      id: walks.id,
      userId: walks.userId,
      treadmillId: walks.treadmillId,
      durationSec: walks.durationSec,
    });

  if (closed.length > 0) {
    console.warn('[walks] autoclosed stale walks', { count: closed.length });

    // Уведомление в Telegram (п. 6.10.4): иначе человек узнаёт об автозакрытии
    // через неделю из рейтинга. Вне горячего пути, дедупликация — внутри notify.
    waitUntil(notifyAutoClosed(closed.map((r) => ({ walkId: r.id, userId: r.userId }))));

    // Переход «всё занято → свободно» случается один раз — событие вешаем на
    // первую закрытую прогулку; имя дорожки дочитываем уже в фоне.
    if (wasFullHouse) {
      const first = closed[0];
      waitUntil(
        (async () => {
          const rows = await db
            .select({ name: treadmills.name })
            .from(treadmills)
            .where(eq(treadmills.id, first.treadmillId))
            .limit(1);
          await notifyTreadmillFreed({
            walkId: first.id,
            treadmillName: rows[0]?.name ?? uiText.fallbackTreadmillName,
            freedByUserId: first.userId,
            busySec: first.durationSec ?? 0,
          });
        })().catch((error) => {
          console.error('[telegram] freed-after-autoclose failed', error);
        }),
      );
    }
  }

  return closed.length;
}
