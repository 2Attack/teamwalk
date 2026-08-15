'use client';

import { useEffect, useId, useState } from 'react';
import { mutate } from 'swr';

import { AvatarPicker } from '@/components/AvatarPicker';
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
import { randomAvatarId } from '@/lib/avatars';
import { m } from '@/lib/i18n';
import { ApiError, apiSend } from '@/lib/client/api';
import type { UserDto } from '@/lib/types';
import { nameSchema } from '@/lib/validation';

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  /** Весь список — из него собираются занятые аватары (п. 6.5). */
  users: UserDto[];
  /** Созданный участник сразу выбирается в селекте (п. 6.2). */
  onCreated: (user: UserDto) => void;
}

/**
 * Модалка создания участника: имя + пиксельный персонаж (п. 6.2).
 *
 * `font="normal"` на всём содержимом: имя, подсказка и текст ошибки — данные,
 * их читают. Пиксельными остаются только заголовок и метки кнопок (п. 6.7.1).
 */
export function AddUserDialog({ open, onClose, users, onCreated }: AddUserDialogProps) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const taken = users.map((u) => u.avatarId);
  const [name, setName] = useState('');
  const [avatarId, setAvatarId] = useState<string>(() => randomAvatarId(taken));
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // При каждом открытии — чистое поле и случайный свободный аватар,
  // чтобы «Создать» была активна сразу и участник не остался без картинки.
  useEffect(() => {
    if (!open) return;
    setName('');
    setNameError(null);
    setFormError(null);
    setAvatarId(randomAvatarId(users.map((u) => u.avatarId)));
    // users намеренно не в зависимостях: пересбор аватара при фоновом
    // обновлении списка сбрасывал бы выбор прямо под курсором.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return; // защита от двойного сабмита

    // Те же правила, что и на сервере: 2–60 символов, разрешённые символы.
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? m.addUser.invalidName);
      return;
    }

    setSaving(true);
    setNameError(null);
    setFormError(null);
    try {
      const user = await apiSend<UserDto>('POST', '/api/users', {
        name: parsed.data,
        avatarId,
      });
      await mutate('/api/users');
      onCreated(user);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NAME_TAKEN') {
        setNameError(m.addUser.nameTaken);
      } else {
        setFormError(errorText(error));
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
            {m.addUser.title}
          </DialogTitle>
          <DialogDescription>{m.addUser.description}</DialogDescription>
        </DialogHeader>

        {/* Форма забирает остаток высоты: сетка персонажей прокручивается внутри,
            а ряд кнопок остаётся на виду на любом экране. */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5">
          <DialogBody className="space-y-5">
            <div className="space-y-2">
              {/* `font="normal"`: метка — sans, как и поле под ней (п. 6.7.1). */}
              <Label htmlFor={nameId} font="normal" className="block text-sm text-text-dim">
                {m.addUser.nameLabel}
              </Label>
              <Input
                id={nameId}
                font="normal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameError !== null}
                aria-describedby={nameError ? errorId : hintId}
                className="min-h-11 w-full text-base"
                maxLength={60}
                autoComplete="off"
                autoFocus
              />
              {nameError ? (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              ) : (
                <p id={hintId} className="text-xs text-text-dim">
                  {m.addUser.nameHint}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm text-text-dim">{m.addUser.pickCharacter}</p>
              <AvatarPicker value={avatarId} onChange={setAvatarId} taken={taken} />
            </div>

            {formError && <FormError text={formError} />}
          </DialogBody>

          <DialogActions
            confirmLabel={saving ? m.common.creating : m.common.create}
            confirmType="submit"
            disabled={saving || name.trim().length === 0}
            saving={saving}
            onCancel={onClose}
          />
        </form>
      </DialogShell>
    </Dialog>
  );
}

interface ChangeAvatarDialogProps {
  open: boolean;
  onClose: () => void;
  /** Участник, которому меняем персонажа; `null` — диалог не показывается. */
  user: UserDto | null;
  users: UserDto[];
}

/** Смена персонажа по клику на свой аватар — та же сетка (п. 6.5). */
export function ChangeAvatarDialog({ open, onClose, user, users }: ChangeAvatarDialogProps) {
  const [avatarId, setAvatarId] = useState<string>(user?.avatarId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setAvatarId(user.avatarId);
    setError(null);
  }, [open, user]);

  if (!user) return null;

  // Свой текущий аватар «занятым» не считаем — иначе он выглядел бы недоступным.
  const taken = users.filter((u) => u.id !== user.id).map((u) => u.avatarId);

  async function handleSave() {
    if (saving || !user) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend<UserDto>('PATCH', `/api/users/${user.id}`, { avatarId });
      await mutate('/api/users');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="retro text-sm leading-snug break-words sm:text-base">
            {m.changeAvatar.title}
          </DialogTitle>
          <DialogDescription>{m.changeAvatar.description}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <AvatarPicker value={avatarId} onChange={setAvatarId} taken={taken} />

          {error && <FormError text={error} />}
        </DialogBody>

        <DialogActions
          confirmLabel={saving ? m.common.saving : m.common.save}
          confirmType="button"
          disabled={saving}
          saving={saving}
          onConfirm={handleSave}
          onCancel={onClose}
        />
      </DialogShell>
    </Dialog>
  );
}

/** Ошибка формы: полоса-акцент вместо голой красной строки. */
function FormError({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="border-l-[3px] border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {text}
    </p>
  );
}

interface DialogActionsProps {
  confirmLabel: string;
  confirmType: 'submit' | 'button';
  disabled: boolean;
  saving: boolean;
  onConfirm?: () => void;
  onCancel: () => void;
}

/**
 * Ряд действий модалки: метки кнопок — пиксельные, тач-таргет 44 px (п. 6.7.1, п. 8).
 * Собран на `DialogFooter` из 8bitcn, как и в модалках прогулки: свой ряд `div`
 * давал здесь другой отступ и другой вариант кнопки отмены, и четыре модалки
 * проекта выглядели по-разному.
 */
function DialogActions({
  confirmLabel,
  confirmType,
  disabled,
  saving,
  onConfirm,
  onCancel,
}: DialogActionsProps) {
  return (
    <DialogFooter className="gap-3">
      <Button
        type="button"
        variant="secondary"
        className="min-h-11 w-full text-xs sm:w-auto"
        onClick={onCancel}
        disabled={saving}
      >
        {m.common.cancel}
      </Button>
      <Button
        type={confirmType}
        className="min-h-11 w-full text-xs sm:w-auto"
        onClick={onConfirm}
        disabled={disabled}
      >
        {confirmLabel}
      </Button>
    </DialogFooter>
  );
}

/** Human error text: the API message or a neutral fallback. */
function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return m.common.networkError;
}
