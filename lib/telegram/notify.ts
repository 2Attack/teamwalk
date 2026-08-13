import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { db } from '@/lib/db';
import { hintsCache, notificationLog } from '@/lib/db/schema';
import type { TelegramLink } from '@/lib/db/schema';
import { avgSpeedKmh } from '@/lib/format';
import type { ActiveWalkDto, FinishWalkResultDto } from '@/lib/types';

import { sendMessage, telegramEnabled } from './client';
import { getLink } from './links';
import { autocloseText, finishText, startText } from './texts';

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
