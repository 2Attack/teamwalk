'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { DialogBody, DialogShell } from '@/components/DialogShell';
import { Button } from '@/components/ui/8bit/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/8bit/dialog';
import { Input } from '@/components/ui/8bit/input';
import { Label } from '@/components/ui/8bit/label';
import { apiSend, revalidateAfterWalk } from '@/lib/client/api';
import {
  DISTANCE_MISMATCH_RATIO,
  MAX_DISTANCE_KM,
  MIN_DISTANCE_KM,
  SHORT_WALK_WARN_SEC,
  SUSPICIOUS_AVG_SPEED_KMH,
} from '@/lib/config';
import {
  avgSpeedKmh,
  calcDistanceKm,
  formatDurationHuman,
  formatKm,
  parseDecimalInput,
} from '@/lib/format';
import type { FinishWalkResultDto } from '@/lib/types';

/**
 * Модалка завершения (п. 6.4). Рамка и метки кнопок — пиксельные, само поле ввода
 * намеренно самое обычное: это единственное обязательное поле в приложении,
 * стилизация здесь только мешает (п. 6.7.7). Отсюда `font="normal"` на инпуте и
 * на всех подписях: их читают, а не разглядывают (п. 6.7.1).
 */

interface FinishWalkDialogProps {
  open: boolean;
  walkId: string;
  /** Заявленная на старте скорость — показывается, но не редактируется. */
  speedKmh: number;
  /** Длительность, зафиксированная в момент нажатия «End walk». */
  durationSec: number;
  /** Esc / клик вне модалки: прогулка остаётся активной, данные не теряются. */
  onClose: () => void;
  onFinished: (result: FinishWalkResultDto) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Не получилось связаться с сервером. Данные не потеряны — попробуйте ещё раз.';
}

export function FinishWalkDialog({
  open,
  walkId,
  speedKmh,
  durationSec,
  onClose,
  onFinished,
}: FinishWalkDialogProps) {
  const calculated = calcDistanceKm(speedKmh, durationSec);
  const [value, setValue] = useState(() => formatKm(calculated));
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const selectedOnce = useRef(false);

  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  // Каждое открытие начинается с расчётного значения: перебитая и брошенная
  // правка не должна всплыть в следующей прогулке.
  useEffect(() => {
    if (!open) return;
    setValue(formatKm(calculated));
    setFailure(null);
    setSubmitting(false);
    selectedOnce.current = false;
  }, [open, calculated]);

  const parsed = parseDecimalInput(value);
  const rounded = parsed === null ? null : Math.round(parsed * 100) / 100;
  const outOfRange = rounded !== null && (rounded < MIN_DISTANCE_KM || rounded > MAX_DISTANCE_KM);
  const valid = rounded !== null && !outOfRange;

  const inputError =
    value.trim() === ''
      ? 'Без дистанции прогулку не сохранить'
      : parsed === null
        ? 'Только число: 1.25 или 1,25'
        : outOfRange
          ? `Допустимо от ${formatKm(MIN_DISTANCE_KM)} до ${formatKm(MAX_DISTANCE_KM)} км`
          : undefined;

  const warnings: string[] = [];
  if (valid && rounded !== null) {
    if (calculated > 0 && Math.abs(rounded - calculated) / calculated > DISTANCE_MISMATCH_RATIO) {
      warnings.push(
        `Рассчитали ${formatKm(calculated)} км, вы ввели ${formatKm(rounded)}. Всё верно?`,
      );
    }
    const factual = avgSpeedKmh(rounded, durationSec);
    if (factual > SUSPICIOUS_AVG_SPEED_KMH) {
      warnings.push(
        `Получилось ${Math.round(factual)} км/ч, а дорожка так не умеет. Проверьте число`,
      );
    }
  }
  if (durationSec < SHORT_WALK_WARN_SEC) {
    warnings.push('Прогулка короче минуты — сохраним, но она почти ничего не добавит');
  }

  async function submit() {
    if (!valid || rounded === null || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      // Повтор безопасен: сервер отвечает 200 с текущим состоянием (п. 8).
      const result = await apiSend<FinishWalkResultDto>('POST', `/api/walks/${walkId}/finish`, {
        distanceKm: rounded,
      });
      await revalidateAfterWalk();
      onFinished(result);
    } catch (error: unknown) {
      setFailure(errorMessage(error));
      setSubmitting(false);
    }
  }

  const describedBy = [hintId, inputError === undefined ? null : errorId]
    .filter((id): id is string => id !== null)
    .join(' ');

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        // Esc и клик вне модалки возвращают на экран активной прогулки:
        // прогулка остаётся активной, введённое значение просто отбрасывается.
        if (!next && !submitting) onClose();
      }}
    >
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="text-[16px] leading-relaxed">Завершить прогулку</DialogTitle>
          <DialogDescription className="font-sans">
            Длительность {formatDurationHuman(durationSec)} · скорость {speedKmh} км/ч
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {/* `font="normal"`: метка — sans, как и поле под ней (п. 6.7.1). */}
          <Label htmlFor={fieldId} font="normal" className="block font-sans text-sm text-text-main">
            Дистанция, км
          </Label>

          <Input
            id={fieldId}
            font="normal"
            className="h-14 text-lg md:text-lg"
            type="text"
            inputMode="decimal"
            autoFocus
            autoComplete="off"
            value={value}
            aria-invalid={inputError !== undefined}
            aria-describedby={describedBy}
            /* Значение выделяется целиком при открытии: ввод сразу заменяет его,
               а при возврате в поле руками курсор уже не прыгает (п. 6.4). */
            onFocus={(event) => {
              if (selectedOnce.current) return;
              selectedOnce.current = true;
              event.currentTarget.select();
            }}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />

          <p id={hintId} className="text-sm text-text-dim">
            рассчитано по {speedKmh} км/ч — поправьте, если на дорожке другое число
          </p>

          {inputError !== undefined ? (
            <p id={errorId} role="alert" className="text-sm text-citrus">
              {inputError}
            </p>
          ) : null}

          {/* Мягкие предупреждения ничего не блокируют — только просят перепроверить. */}
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-citrus">
              {warning}
            </p>
          ))}

          {failure !== null ? (
            <p role="alert" className="text-sm text-citrus">
              {failure} Нажмите «Сохранить» ещё раз — повтор не создаст дубль.
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter className="gap-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={submitting}
            type="button"
            className="min-h-11 w-full sm:w-auto"
          >
            Назад
          </Button>
          <Button
            variant="default"
            onClick={submit}
            disabled={!valid || submitting}
            type="button"
            className="min-h-11 w-full sm:w-auto"
          >
            {submitting ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogShell>
    </Dialog>
  );
}
