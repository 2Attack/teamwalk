'use client';

import { useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/8bit/alert';
import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { apiSend, useTelegramStatus } from '@/lib/client/api';
import { playChirp } from '@/lib/client/sound';
import { TG_NUDGE_AFTER_SEC } from '@/lib/config';
import type { TelegramLinkTokenDto } from '@/lib/types';

interface TelegramNudgeProps {
  userId: string;
  /** ISO старта прогулки — от него отсчитывается минута до показа. */
  startedAt: string;
}

/**
 * Панель «Привяжи Telegram» на экране активной прогулки (п. 6.10.2).
 *
 * Показывается через `TG_NUDGE_AFTER_SEC` после старта и только когда сервер
 * разрешил (`nudgeEligible`): лимиты показов, кулдаун и «не предлагать» живут
 * в БД на участнике, клиент их не дублирует. Появившись, панель **висит до
 * конца прогулки** — по таймеру не закрывается; убирают её только привязка
 * или «Больше не напоминать».
 */
export function TelegramNudge({ userId, startedAt }: TelegramNudgeProps) {
  const { data: status, mutate: mutateStatus } = useTelegramStatus(userId);

  // Первую минуту человек настраивает скорость и раскладывает ноутбук — не мешаем.
  // Один setTimeout на остаток: если срок уже вышел (страницу перезагрузили
  // посреди прогулки), показываем сразу.
  const [ripe, setRipe] = useState(false);
  useEffect(() => {
    const remainingMs =
      TG_NUDGE_AFTER_SEC * 1000 - (Date.now() - new Date(startedAt).getTime());
    if (remainingMs <= 0) {
      setRipe(true);
      return;
    }
    const timer = window.setTimeout(() => setRipe(true), remainingMs);
    return () => window.clearTimeout(timer);
  }, [startedAt]);

  const [hiddenLocally, setHiddenLocally] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [awaitingReturn, setAwaitingReturn] = useState(false);

  // Показ существует только в видимой вкладке: фоновая вкладка с этим же
  // экраном иначе «показала» бы панель первой — счётчик и кулдаун записались
  // бы, а человек ничего не увидел бы ни там, ни здесь.
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // Защёлка показа: после записи «shown» сервер начинает отсчитывать кулдаун,
  // и очередная SWR-ревалидация вернула бы `nudgeEligible: false` — без защёлки
  // панель гасла бы сама через пару минут. Появилась — висит; закрывают её
  // только привязка (status.linked) и кнопка «Больше не напоминать».
  const [latched, setLatched] = useState(false);
  useEffect(() => {
    if (ripe && pageVisible && !hiddenLocally && status?.nudgeEligible === true) {
      setLatched(true);
    }
  }, [ripe, pageVisible, hiddenLocally, status?.nudgeEligible]);
  useEffect(() => {
    if (status?.linked === true) setLatched(false);
  }, [status?.linked]);

  const visible = latched && !hiddenLocally;

  // Первое появление — ровно один раз за прогулку: чирп и счётчик показа.
  // POST — именно счётчик, не функциональность: его ошибка панель не трогает.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!visible || announcedRef.current) return;
    announcedRef.current = true;
    playChirp();
    void apiSend<unknown>('POST', `/api/users/${userId}/telegram/nudge`, {
      action: 'shown',
    }).catch(() => undefined);
  }, [visible, userId]);

  // Человек ушёл в Telegram и вернулся — статус мог смениться на `linked`,
  // тогда `nudgeEligible` станет false и панель исчезнет сама. Перечитываем
  // по возвращении вкладки и страховочно через несколько секунд.
  useEffect(() => {
    if (!awaitingReturn) return;
    const revalidate = () => void mutateStatus();
    const onVisible = () => {
      if (document.visibilityState === 'visible') revalidate();
    };
    const timer = window.setTimeout(revalidate, 5_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [awaitingReturn, mutateStatus]);

  const openLink = async () => {
    if (linking) return;
    setLinking(true);
    setLinkError(null);
    try {
      const dto = await apiSend<TelegramLinkTokenDto>(
        'POST',
        `/api/users/${userId}/telegram/link-token`,
      );
      window.open(dto.url, '_blank', 'noopener');
      setAwaitingReturn(true);
    } catch (error: unknown) {
      setLinkError(
        error instanceof Error && error.message
          ? error.message
          : 'Не вышло получить ссылку — проверьте связь и попробуйте ещё раз',
      );
    } finally {
      setLinking(false);
    }
  };

  const dismissForever = () => {
    // Сначала прячем, потом сообщаем серверу: «не предлагать» должно сработать
    // мгновенно, а счётчик догонит (его ошибка — не повод вернуть панель).
    setHiddenLocally(true);
    void apiSend<unknown>('POST', `/api/users/${userId}/telegram/nudge`, {
      action: 'dismissed',
    }).catch(() => undefined);
  };

  if (!visible) return null;

  return (
    <section
      aria-label="Приглашение привязать Telegram"
      // Появление — только transform/opacity и только под motion-safe:
      // при prefers-reduced-motion панель просто появляется (звук остаётся,
      // он не motion — п. 6.10.2). px-1.5 — место под боковые пиксели рамки.
      className="px-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
    >
      {/* Alert из 8bitcn рисует пиксельную рамку сам; font="normal" — пиксельный
          шрифт вешаем точечно на заголовок, текст читают обычным sans (п. 6.7.1). */}
      <Alert font="normal" className="flex flex-col gap-2 bg-bg-panel p-3">
        <AlertTitle className="flex items-center gap-2 font-pixel text-[12px] leading-none text-citrus">
          {/* Речевой пузырь из общего пиксельного набора — бот же пишет (п. 6.7.4). */}
          <Icon name="hint" size={16} />
          TELEGRAM
        </AlertTitle>

        <AlertDescription className="w-full text-sm leading-relaxed text-text-main">
          <p>Бот пришлёт итоги прогулок, ачивки и напомнит размяться.</p>

          {linkError !== null ? (
            <p role="alert" className="text-citrus">
              {linkError}
            </p>
          ) : null}

          <div className="flex w-full items-center gap-2 pt-1">
            <Button
              type="button"
              onClick={openLink}
              disabled={linking}
              className="min-h-11 flex-1"
            >
              {linking ? 'Открываем…' : 'Подключить'}
            </Button>
            <Button
              variant="ghost"
              font="normal"
              type="button"
              onClick={dismissForever}
              className="min-h-11 text-sm text-text-dim"
            >
              Больше не напоминать
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </section>
  );
}
