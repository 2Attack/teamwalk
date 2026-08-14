'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/8bit/alert';
import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { TelegramLinkDialog } from '@/components/TelegramLinkDialog';
import { useTelegramStatus } from '@/lib/client/api';

interface TelegramNudgeProps {
  userId: string;
}

/**
 * Панель «Привяжи Telegram» на экране активной прогулки (п. 6.10.2).
 *
 * Видна всегда, пока участник не привязан (и подсистема включена): без счётчиков,
 * кулдаунов и кнопки отказа — привязка достаточно ценна, чтобы место на экране
 * напоминало о ней каждую прогулку. Исчезает панель единственным способом —
 * привязкой; «Подключить» открывает модалку с QR-кодом и ссылкой (п. 6.10.3).
 */
export function TelegramNudge({ userId }: TelegramNudgeProps) {
  const { data: status } = useTelegramStatus(userId);
  const [dialogOpen, setDialogOpen] = useState(false);

  // До ответа сервера панели нет: мигнувшая и исчезнувшая — хуже, чем чуть позже.
  if (status === undefined || !status.enabled || status.linked) return null;

  return (
    <section
      aria-label="Приглашение привязать Telegram"
      // px-1.5 — место под боковые пиксели рамки Alert.
      className="px-1.5"
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

          <div className="flex w-full items-center gap-2 pt-1">
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="min-h-11 flex-1"
            >
              Подключить
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
