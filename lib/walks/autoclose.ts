import { waitUntil } from '@vercel/functions';
import { and, eq, lt, sql } from 'drizzle-orm';

import { STALE_WALK_HOURS } from '@/lib/config';
import { db } from '@/lib/db';
import { walks } from '@/lib/db/schema';
import { notifyAutoClosed } from '@/lib/telegram/notify';

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

  const closed = await db
    .update(walks)
    .set({
      status: 'cancelled',
      endedAt: sql`now()`,
      durationSec: sql`greatest(0, extract(epoch from (now() - ${walks.startedAt}))::int)`,
    })
    .where(and(eq(walks.status, 'active'), lt(walks.startedAt, sql`now() - ${staleInterval}`)))
    .returning({ id: walks.id, userId: walks.userId });

  if (closed.length > 0) {
    console.warn('[walks] autoclosed stale walks', { count: closed.length });

    // Уведомление в Telegram (п. 6.10.4): иначе человек узнаёт об автозакрытии
    // через неделю из рейтинга. Вне горячего пути, дедупликация — внутри notify.
    waitUntil(notifyAutoClosed(closed.map((r) => ({ walkId: r.id, userId: r.userId }))));
  }

  return closed.length;
}
