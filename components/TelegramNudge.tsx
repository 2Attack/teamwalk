'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/8bit/alert';
import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { TelegramLinkDialog } from '@/components/TelegramLinkDialog';
import { apiSend, useTelegramStatus } from '@/lib/client/api';
import { m } from '@/lib/i18n';

interface TelegramNudgeProps {
  userId: string;
}

/**
 * Панель «Привяжи Telegram» на экране активной прогулки (п. 6.10.2).
 *
 * Видна, пока участник не привязан (и подсистема включена): без счётчиков
 * и кулдаунов. Убирают её два события: привязка и «Больше не показывать» —
 * отказ хранится в БД на участнике и действует с любого устройства, отвязка
 * его сбрасывает. «Подключить» открывает модалку с QR-кодом и ссылкой (п. 6.10.3).
 */
export function TelegramNudge({ userId }: TelegramNudgeProps) {
  const { data: status, mutate: mutateStatus } = useTelegramStatus(userId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const dismissForever = () => {
    if (status === undefined) return;
    // Сначала прячем (оптимистичный mutate), потом сообщаем серверу: отказ должен
    // сработать мгновенно, а ошибка записи — не повод вернуть панель на экран.
    void mutateStatus({ ...status, dismissed: true }, { revalidate: false });
    void apiSend<unknown>('POST', `/api/users/${userId}/telegram/dismiss`).catch(
      () => undefined,
    );
  };

  // До ответа сервера панели нет: мигнувшая и исчезнувшая — хуже, чем чуть позже.
  if (status === undefined || !status.enabled || status.linked || status.dismissed) return null;

  return (
    <section
      aria-label={m.telegram.nudgeAria}
      // px-1.5 — место под боковые пиксели рамки Alert.
      className="px-1.5"
    >
      {/* Alert из 8bitcn рисует пиксельную рамку сам; font="normal" — пиксельный
          шрифт вешаем точечно на заголовок, текст читают обычным sans (п. 6.7.1). */}
      <Alert font="normal" className="flex flex-col gap-2 bg-bg-panel p-3">
        <AlertTitle className="flex items-center gap-2 font-pixel text-[12px] leading-none text-citrus">
          {/* Речевой пузырь из общего пиксельного набора — бот же пишет (п. 6.7.4). */}
          <Icon name="hint" size={16} />
          {m.telegram.nudgeTitle}
        </AlertTitle>

        <AlertDescription className="w-full text-sm leading-relaxed text-text-main">
          <p>{m.telegram.nudgeBody}</p>

          <div className="flex w-full flex-col gap-1 pt-1">
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="min-h-11 w-full"
            >
              {m.telegram.connect}
            </Button>
            <Button
              variant="ghost"
              font="normal"
              type="button"
              onClick={dismissForever}
              className="min-h-11 w-full text-sm text-text-dim"
            >
              {m.telegram.dontShowAgain}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <TelegramLinkDialog
        open={dialogOpen}
        userId={userId}
        onClose={() => setDialogOpen(false)}
      />
    </section>
  );
}
