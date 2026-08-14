'use client';

import { useEffect, useId, useState } from 'react';

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
import { ApiError, apiSend, revalidateTreadmills } from '@/lib/client/api';
import { MAX_SPEED_KMH_ABS, MIN_SPEED_KMH } from '@/lib/config';
import type { TreadmillAdminDto } from '@/lib/types';
import {
  treadmillMaxSpeedSchema,
  treadmillNameSchema,
  treadmillSortOrderSchema,
} from '@/lib/validation';

interface TreadmillFormDialogProps {
  open: boolean;
  /** `null` — create mode; a row — edit mode. */
  treadmill: TreadmillAdminDto | null;
  onClose: () => void;
}

/** Default ceiling for a new treadmill — matches the seed record (spec § 6.9.2). */
const DEFAULT_MAX_SPEED_KMH = 10;

/**
 * One dialog for both create and edit (spec § 6.11.3). Number fields are plain
 * inputs, not button rows: the button-row rule (spec § 6.2) optimizes the
 * frequent start flow, not a setting touched once a year.
 */
export function TreadmillFormDialog({ open, treadmill, onClose }: TreadmillFormDialogProps) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const nameErrorId = `${fieldId}-name-error`;
  const speedId = `${fieldId}-speed`;
  const speedErrorId = `${fieldId}-speed-error`;
  const orderId = `${fieldId}-order`;
  const orderErrorId = `${fieldId}-order-error`;

  const [name, setName] = useState('');
  const [maxSpeed, setMaxSpeed] = useState(String(DEFAULT_MAX_SPEED_KMH));
  const [sortOrder, setSortOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    maxSpeed?: string;
    sortOrder?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset to the target's values on every open: the dialog is reused for
  // different rows and for create-after-edit.
  useEffect(() => {
    if (!open) return;
    setName(treadmill?.name ?? '');
    setMaxSpeed(String(treadmill?.maxSpeedKmh ?? DEFAULT_MAX_SPEED_KMH));
    setSortOrder(String(treadmill?.sortOrder ?? 0));
    setIsActive(treadmill?.isActive ?? true);
    setFieldErrors({});
    setFormError(null);
  }, [open, treadmill]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    // The same Zod schemas as on the server (spec § 3). Number inputs are
    // parsed first: an empty or non-numeric string must fail in Russian here,
    // not with a generic type error.
    const errors: typeof fieldErrors = {};
    const parsedName = treadmillNameSchema.safeParse(name);
    if (!parsedName.success) {
      errors.name = parsedName.error.issues[0]?.message ?? 'Некорректное название';
    }
    const speedNumber = parseIntStrict(maxSpeed);
    const parsedSpeed =
      speedNumber === null ? null : treadmillMaxSpeedSchema.safeParse(speedNumber);
    if (!parsedSpeed || !parsedSpeed.success) {
      errors.maxSpeed =
        parsedSpeed?.error.issues[0]?.message ??
        `Целое число от ${MIN_SPEED_KMH} до ${MAX_SPEED_KMH_ABS}`;
    }
    const orderNumber = parseIntStrict(sortOrder);
    const parsedOrder =
      orderNumber === null ? null : treadmillSortOrderSchema.safeParse(orderNumber);
    if (!parsedOrder || !parsedOrder.success) {
      errors.sortOrder = parsedOrder?.error.issues[0]?.message ?? 'Целое число от 0 до 999';
    }
    setFieldErrors(errors);
    if (!parsedName.success || !parsedSpeed?.success || !parsedOrder?.success) return;

    setSaving(true);
    setFormError(null);
    try {
      if (treadmill) {
        await apiSend<TreadmillAdminDto>('PATCH', `/api/treadmills/${treadmill.id}`, {
          name: parsedName.data,
          maxSpeedKmh: parsedSpeed.data,
          sortOrder: parsedOrder.data,
          isActive,
        });
      } else {
        await apiSend<TreadmillAdminDto>('POST', '/api/treadmills', {
          name: parsedName.data,
          maxSpeedKmh: parsedSpeed.data,
          sortOrder: parsedOrder.data,
        });
      }
      await revalidateTreadmills();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NAME_TAKEN') {
        setFieldErrors((prev) => ({ ...prev, name: error.message }));
      } else if (error instanceof ApiError) {
        setFormError(error.message);
      } else {
        setFormError('Не удалось связаться с сервером. Проверьте сеть и повторите.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="retro text-sm leading-snug break-words sm:text-base">
            {treadmill ? 'Изменить дорожку' : 'Новая дорожка'}
          </DialogTitle>
          <DialogDescription>
            Название видно в селекторе старта, потолок ограничивает выбор скорости.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5">
          <DialogBody className="space-y-5">
            <FormField
              id={nameId}
              errorId={nameErrorId}
              label="Название *"
              error={fieldErrors.name}
              hint="От 2 до 60 символов, например «У окна»."
            >
              <Input
                id={nameId}
                font="normal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={fieldErrors.name !== undefined}
                aria-describedby={fieldErrors.name ? nameErrorId : undefined}
                className="min-h-11 w-full text-base"
                maxLength={60}
                autoComplete="off"
                autoFocus
              />
            </FormField>

            <FormField
              id={speedId}
              errorId={speedErrorId}
              label="Потолок скорости, км/ч *"
              error={fieldErrors.maxSpeed}
              hint={`Целое от ${MIN_SPEED_KMH} до ${MAX_SPEED_KMH_ABS} — как на шильдике дорожки.`}
            >
              <Input
                id={speedId}
                font="normal"
                type="number"
                inputMode="numeric"
                min={MIN_SPEED_KMH}
                max={MAX_SPEED_KMH_ABS}
                step={1}
                value={maxSpeed}
                onChange={(e) => setMaxSpeed(e.target.value)}
                aria-invalid={fieldErrors.maxSpeed !== undefined}
                aria-describedby={fieldErrors.maxSpeed ? speedErrorId : undefined}
                className="min-h-11 w-full text-base"
              />
            </FormField>

            <FormField
              id={orderId}
              errorId={orderErrorId}
              label="Порядок в списке"
              error={fieldErrors.sortOrder}
              hint="Меньше — выше в селекторе старта."
            >
              <Input
                id={orderId}
                font="normal"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                step={1}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                aria-invalid={fieldErrors.sortOrder !== undefined}
                aria-describedby={fieldErrors.sortOrder ? orderErrorId : undefined}
                className="min-h-11 w-full text-base"
              />
            </FormField>

            {/* The active toggle exists only in edit mode: a new treadmill is
                always created active (spec § 6.11.3). */}
            {treadmill && (
              <Button
                type="button"
                variant={isActive ? 'default' : 'secondary'}
                aria-pressed={isActive}
                className="min-h-11 w-full text-xs sm:w-auto"
                onClick={() => setIsActive((v) => !v)}
              >
                {isActive ? 'Дорожка активна' : 'Дорожка выключена'}
              </Button>
            )}

            {formError && (
              <p
                role="alert"
                className="border-l-[3px] border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            )}
          </DialogBody>

          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full text-xs sm:w-auto"
              onClick={onClose}
              disabled={saving}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              className="min-h-11 w-full text-xs sm:w-auto"
              disabled={saving || name.trim().length === 0}
            >
              {saving ? 'Сохраняем…' : treadmill ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  );
}

interface FormFieldProps {
  id: string;
  errorId: string;
  label: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}

/** Label + control + error-or-hint line — the same layout for all three fields. */
function FormField({ id, errorId, label, hint, error, children }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} font="normal" className="block text-sm text-text-dim">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-xs text-text-dim">{hint}</p>
      )}
    </div>
  );
}

/** Strict integer parse: '' and '7.5' are null, unlike Number/parseInt quirks. */
function parseIntStrict(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
