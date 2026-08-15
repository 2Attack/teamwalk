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
  formatDurationHuman,
  formatKm,
  formatSpeedTrail,
  parseDecimalInput,
} from '@/lib/format';
import { fmt, m } from '@/lib/i18n';
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
  /**
   * Скорости прогулки по порядку: одна, если её не меняли (п. 6.3).
   * Показываются, но не редактируются — правят итоговую дистанцию.
   */
  speedTrail: number[];
  /** Расчётная дистанция по отрезкам скорости на момент нажатия «End walk». */
  calculatedKm: number;
  /** Длительность, зафиксированная в момент нажатия «End walk». */
  durationSec: number;
  /** Esc / клик вне модалки: прогулка остаётся активной, данные не теряются. */
  onClose: () => void;
  onFinished: (result: FinishWalkResultDto) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return m.finishDialog.submitFailed;
}

export function FinishWalkDialog({
  open,
  walkId,
  speedTrail,
  calculatedKm,
  durationSec,
  onClose,
  onFinished,
}: FinishWalkDialogProps) {
  const calculated = calculatedKm;
  const speedLabel = formatSpeedTrail(speedTrail);
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
      ? m.finishDialog.errorRequired
      : parsed === null
        ? m.finishDialog.errorNotANumber
        : outOfRange
          ? fmt(m.finishDialog.errorOutOfRange, {
              min: formatKm(MIN_DISTANCE_KM),
              max: formatKm(MAX_DISTANCE_KM),
            })
          : undefined;

  const warnings: string[] = [];
  if (valid && rounded !== null) {
    if (calculated > 0 && Math.abs(rounded - calculated) / calculated > DISTANCE_MISMATCH_RATIO) {
      warnings.push(
        fmt(m.finishDialog.warnMismatch, {
          calculated: formatKm(calculated),
          entered: formatKm(rounded),
        }),
      );
    }
    const factual = avgSpeedKmh(rounded, durationSec);
    if (factual > SUSPICIOUS_AVG_SPEED_KMH) {
      warnings.push(fmt(m.finishDialog.warnTooFast, { speed: Math.round(factual) }));
    }
  }
  if (durationSec < SHORT_WALK_WARN_SEC) {
    warnings.push(m.finishDialog.warnShort);
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
          <DialogTitle className="text-[16px] leading-relaxed">{m.finishDialog.title}</DialogTitle>
          <DialogDescription className="font-sans">
            {fmt(m.finishDialog.summary, {
              duration: formatDurationHuman(durationSec),
              speeds: speedLabel,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {/* `font="normal"`: метка — sans, как и поле под ней (п. 6.7.1). */}
          <Label htmlFor={fieldId} font="normal" className="block font-sans text-sm text-text-main">
            {m.finishDialog.distanceLabel}
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
            {fmt(m.finishDialog.hint, { speeds: speedLabel })}
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
              {failure} {m.finishDialog.retrySafe}
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
            {m.common.back}
          </Button>
          <Button
            variant="default"
            onClick={submit}
            disabled={!valid || submitting}
            type="button"
            className="min-h-11 w-full sm:w-auto"
          >
            {submitting ? m.common.saving : m.common.save}
          </Button>
        </DialogFooter>
      </DialogShell>
    </Dialog>
  );
}
