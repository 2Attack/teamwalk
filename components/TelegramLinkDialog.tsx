'use client';

import { useEffect, useState } from 'react';

import QRCode from 'qrcode';

import { DialogBody, DialogShell } from '@/components/DialogShell';
import { Button } from '@/components/ui/8bit/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/8bit/dialog';
import { apiSend, useTelegramStatus } from '@/lib/client/api';
import type { TelegramLinkTokenDto } from '@/lib/types';

interface TelegramLinkDialogProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

/**
 * Модалка привязки Telegram (п. 6.10.3): QR-код deep link'а и ссылка под ним.
 *
 * Типовой сценарий — человек идёт по дорожке с ноутбуком, а Telegram у него
 * в телефоне: QR переносит ссылку между устройствами без набора руками.
 * Ссылка под кодом — для тех, у кого Telegram на этом же устройстве.
 *
 * Пока модалка открыта, статус перечитывается раз в несколько секунд: привязка
 * завершается в другом приложении, и «сама закрылась — значит получилось» —
 * единственная обратная связь, которую можно дать без авторизации.
 */
export function TelegramLinkDialog({ open, userId, onClose }: TelegramLinkDialogProps) {
  const { data: status, mutate: mutateStatus } = useTelegramStatus(userId);

  const [link, setLink] = useState<TelegramLinkTokenDto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Счётчик запросов токена: смена значения перезапускает эффект загрузки.
  const [attempt, setAttempt] = useState(0);

  // Каждое открытие — свежий токен: у старого мог истечь TTL (15 минут).
  useEffect(() => {
    if (!open) return;
    setLink(null);
    setQrDataUrl(null);
    setError(null);

    let cancelled = false;
    void apiSend<TelegramLinkTokenDto>('POST', `/api/users/${userId}/telegram/link-token`)
      .then((dto) => {
        if (!cancelled) setLink(dto);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'Не вышло получить ссылку — проверьте связь и попробуйте ещё раз',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, attempt]);

  // QR рисуется на клиенте из уже полученной ссылки — без внешних запросов
  // (генераторы-сервисы нарушали бы правило «в рантайме сторонних запросов нет»).
  // Чёрные модули на белом: инверсия под тёмную тему читается камерами хуже.
  useEffect(() => {
    if (link === null) return;
    let cancelled = false;
    void QRCode.toDataURL(link.url, {
      errorCorrectionLevel: 'M',
      margin: 0,
      scale: 8,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        // QR — усилитель, не единственный путь: ссылка ниже работает и без него.
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  // Опрос статуса, пока модалка открыта: привязались — закрываемся.
  // Заодно меняем протухший токен, не дожидаясь, пока человек отсканирует мёртвый QR.
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      void mutateStatus();
      if (link !== null && Date.parse(link.expiresAt) <= Date.now()) {
        setAttempt((n) => n + 1);
      }
    };
    const timer = window.setInterval(tick, 4_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, link, mutateStatus]);

  useEffect(() => {
    if (open && status?.linked === true) onClose();
  }, [open, status?.linked, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="text-[16px] leading-relaxed">Привязать Telegram</DialogTitle>
          <DialogDescription className="font-sans">
            Наведите камеру телефона на код — откроется чат с ботом, останется нажать «Start»
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col items-center gap-4">
          {error !== null ? (
            <>
              <p role="alert" className="text-sm text-citrus">
                {error}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setAttempt((n) => n + 1)}
              >
                Попробовать ещё раз
              </Button>
            </>
          ) : (
            <>
              {/* Белая подложка обязательна: камере нужна «тихая зона» вокруг кода. */}
              <div className="flex size-56 items-center justify-center bg-white p-3">
                {qrDataUrl !== null ? (
                  /* Дата-URL, сгенерированный на месте, — не кандидат в next/image. */
                  <img
                    src={qrDataUrl}
                    alt="QR-код привязки Telegram"
                    className="size-full [image-rendering:pixelated]"
                  />
                ) : (
                  <p className="text-center font-sans text-sm text-neutral-500">
                    {link === null ? 'Получаем ссылку…' : 'QR не нарисовался — ссылка ниже'}
                  </p>
                )}
              </div>

              {link !== null ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 text-center font-sans text-sm text-citrus underline underline-offset-4"
                >
                  Привязать по ссылке — если Telegram на этом устройстве
                </a>
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            className="min-h-11 w-full sm:w-auto"
          >
            Закрыть
          </Button>
        </DialogFooter>
      </DialogShell>
    </Dialog>
  );
}
