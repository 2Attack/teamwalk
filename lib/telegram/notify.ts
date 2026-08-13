import { and, desc, eq, inArray, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm';

import { FREE_WINDOW_END_HOUR, FREE_WINDOW_START_HOUR } from '@/lib/config';
import { db } from '@/lib/db';
import { hintsCache, notificationLog, telegramLinks, treadmills, walks } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';
import { avgSpeedKmh } from '@/lib/format';
import { isWeekend, officeHour, toOfficeDay } from '@/lib/time';
import type { ActiveWalkDto, FinishWalkResultDto } from '@/lib/types';

import { sendMessage, telegramEnabled } from './client';
import { getLink } from './links';
import { autocloseText, finishText, freeText, startText } from './texts';

/**
 * Событийные уведомления: старт, финиш, автозакрытие (п. 6.10.4, 6.10.5 ТЗ).
 *
 * Самодостаточные фоновые задачи: вызываются из хендлеров через `waitUntil()`
 * после ответа клиенту, сами читают привязку и настройки. Никогда не бросают —
 * недоступность Telegram не влияет ни на одну функцию приложения (п. 6.10.1).
 *
 * Идемпотентность — журналом `notification_log`: вставка ключа дедупликации
 * с unique-индексом; пустой `returning` означает «другой инстанс уже отправил».
 */

/** Заглушено командой `/mute`: дата в будущем — молчим (п. 6.10.3). */
function isMuted(link: TelegramLink): boolean {
  return link.mutedUntil !== null && link.mutedUntil.getTime() > Date.now();
}

/** true — ключ вставлен нами, можно отправлять; false — уже отправлено. */
async function tryDedup(userId: string, kind: string, dedupKey: string): Promise<boolean> {
  const rows = await db
    .insert(notificationLog)
    .values({ userId, kind, dedupKey })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  return rows.length > 0;
}

/**
 * Постскриптум-хинт к финишу (п. 6.10.4): строка из готового `hints_cache`
 * с двумя дополнительными ситами — `tone ∈ {praise, neutral, tip}` и субъект
 * сам получатель либо никто. `tease` в личку не попадает вовсе: на общем
 * экране это игра, один на один — укол. Любая ошибка — просто без хинта.
 */
async function pickHint(userId: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ text: hintsCache.text })
      .from(hintsCache)
      .where(
        and(
          inArray(hintsCache.tone, ['praise', 'neutral', 'tip']),
          or(isNull(hintsCache.subjectId), eq(hintsCache.subjectId, userId)),
        ),
      )
      .orderBy(desc(hintsCache.generatedAt))
      .limit(30);
    if (rows.length === 0) return null;
    return rows[Math.floor(Math.random() * rows.length)].text;
  } catch (error) {
    console.error('[telegram] hint postscript failed', error);
    return null;
  }
}

/** Старт прогулки: тихое, с кнопкой «Это не я» — защита от розыгрышей (п. 6.10). */
export async function notifyWalkStarted(walk: ActiveWalkDto): Promise<void> {
  try {
    if (!telegramEnabled()) return;

    const link = await getLink(walk.userId);
    if (!link || !link.notifyStart || isMuted(link)) return;
    if (!(await tryDedup(walk.userId, 'start', `start:${walk.id}`))) return;

    await sendMessage(link.chatId, startText({ speedKmh: walk.speedKmh, treadmillName: walk.treadmillName }), {
      silent: true,
      replyMarkup: {
        inline_keyboard: [[{ text: 'Это не я — отменить', callback_data: `cancel:${walk.id}` }]],
      },
    });
  } catch (error) {
    console.error('[telegram] notifyWalkStarted failed', error);
  }
}

/** Финиш: главное сообщение продукта, обычное (не тихое). */
export async function notifyWalkFinished(result: FinishWalkResultDto): Promise<void> {
  try {
    if (!telegramEnabled()) return;

    const { walk } = result;
    const link = await getLink(walk.userId);
    if (!link || !link.notifyFinish || isMuted(link)) return;
    if (!(await tryDedup(walk.userId, 'finish', `finish:${walk.id}`))) return;

    const distanceKm = walk.distanceKm ?? 0;
    const durationSec = walk.durationSec ?? 0;

    let text = finishText({
      distanceKm,
      durationSec,
      avgSpeedKmh: avgSpeedKmh(distanceKm, durationSec),
      streakDays: result.streak.days,
      rankCurrent: result.rank.current,
      rankPrevious: result.rank.previous,
      achievements: result.newAchievements.map((a) => a.title),
    });

    if (link.attachHints) {
      const hint = await pickHint(walk.userId);
      if (hint !== null) text += `\n\nP.S. ${hint}`;
    }

    await sendMessage(link.chatId, text);
  } catch (error) {
    console.error('[telegram] notifyWalkFinished failed', error);
  }
}

/**
 * «Все ли дорожки заняты?» — вызывается **до** освобождения (финиш/отмена/
 * автозакрытие): после апдейта переход «всё занято → свободно» уже не увидеть.
 * Ошибка или выключенный Telegram — false: уведомление-подсказка не стоит
 * лишнего запроса в горячем пути (п. 6.10.4).
 */
export async function wereAllTreadmillsBusy(): Promise<boolean> {
  if (!telegramEnabled()) return false;
  try {
    // Два простых запроса вместо коррелированного exists в filter: дорожек
    // единицы, а прозрачность здесь дороже одного round-trip'а.
    const totals = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(treadmills)
      .where(eq(treadmills.isActive, true));
    const total = totals[0]?.total ?? 0;
    if (total === 0) return false;

    const busyRows = await db
      .selectDistinct({ treadmillId: walks.treadmillId })
      .from(walks)
      .innerJoin(treadmills, eq(treadmills.id, walks.treadmillId))
      .where(and(eq(walks.status, 'active'), eq(treadmills.isActive, true)));

    return busyRows.length >= total;
  } catch (error) {
    console.error('[telegram] wereAllTreadmillsBusy failed', error);
    return false;
  }
}

/**
 * «Дорожка освободилась» (п. 6.10.4) — единственная широковещательная категория.
 * Вызывающий код обязан проверить `wereAllTreadmillsBusy()` до освобождения:
 * событие — переход «всё занято → появилась свободная», а не каждый финиш.
 *
 * Не шлётся освободившему и тем, кто идёт прямо сейчас. Вне рабочего окна —
 * просто молчим, без переносов: событие протухает мгновенно. Дедупликация —
 * `free:<walkId>`, один ключ на событие, а не на получателя.
 */
export async function notifyTreadmillFreed(input: {
  walkId: string;
  treadmillName: string;
  freedByUserId: string;
  busySec: number;
}): Promise<void> {
  try {
    if (!telegramEnabled()) return;

    // Окно шире, чем у напоминаний (п. 6.10.4): пока люди в офисе — шлём.
    const now = new Date();
    if (isWeekend(toOfficeDay(now))) return;
    const hour = officeHour(now);
    if (hour < FREE_WINDOW_START_HOUR || hour >= FREE_WINDOW_END_HOUR) return;

    if (!(await tryDedup(input.freedByUserId, 'free', `free:${input.walkId}`))) return;

    const recipients = await db
      .select({ chatId: telegramLinks.chatId })
      .from(telegramLinks)
      .where(
        and(
          eq(telegramLinks.notifyFree, true),
          or(isNull(telegramLinks.mutedUntil), lt(telegramLinks.mutedUntil, sql`now()`)),
          ne(telegramLinks.userId, input.freedByUserId),
          // Идущим прямо сейчас дорожка не нужна.
          notExists(
            db
              .select({ one: sql`1` })
              .from(walks)
              .where(and(eq(walks.status, 'active'), eq(walks.userId, telegramLinks.userId))),
          ),
        ),
      );
    if (recipients.length === 0) return;

    // Один текст на событие: получатели видят одну и ту же фразу — это
    // объявление по громкой связи, а не персональное сообщение.
    const text = freeText({ treadmillName: input.treadmillName, busySec: input.busySec });
    for (const { chatId } of recipients) {
      await sendMessage(chatId, text);
    }
  } catch (error) {
    console.error('[telegram] notifyTreadmillFreed failed', error);
  }
}

/**
 * Автозакрытие (п. 7.6): тихое, под тумблером финиша — иначе человек узнаёт
 * о потерянной дистанции через неделю из рейтинга. Ошибка по одному участнику
 * не мешает уведомить остальных.
 */
export async function notifyAutoClosed(
  closed: Array<{ walkId: string; userId: string }>,
): Promise<void> {
  try {
    if (!telegramEnabled() || closed.length === 0) return;

    for (const { walkId, userId } of closed) {
      try {
        const link = await getLink(userId);
        if (!link || !link.notifyFinish || isMuted(link)) continue;
        if (!(await tryDedup(userId, 'autoclose', `autoclose:${walkId}`))) continue;

        await sendMessage(link.chatId, autocloseText(), { silent: true });
      } catch (error) {
        console.error('[telegram] notifyAutoClosed failed for walk', walkId, error);
      }
    }
  } catch (error) {
    console.error('[telegram] notifyAutoClosed failed', error);
  }
}
