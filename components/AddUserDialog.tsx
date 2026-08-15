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
  /** Full user list — used to derive taken avatars (spec § 6.5). */
  users: UserDto[];
  /** The created user is immediately selected in the picker (spec § 6.2). */
  onCreated: (user: UserDto) => void;
}

/**
 * Create-user dialog: name + pixel character (spec § 6.2).
 * `font="normal"` on all content — only the title and button labels stay pixel (spec § 6.7.1).
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

  // On each open: clean field and a random free avatar, so "Create" is
  // enabled right away and the user never ends up without a picture.
  useEffect(() => {
    if (!open) return;
    setName('');
    setNameError(null);
    setFormError(null);
    setAvatarId(randomAvatarId(users.map((u) => u.avatarId)));
    // users deliberately excluded from deps: re-rolling the avatar on a
    // background list refresh would reset the choice under the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return; // guard against double submit

    // Same rules as the server: 2–60 chars, allowed characters only.
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

        {/* Form takes the remaining height: the character grid scrolls inside,
            the button row stays visible on any screen. */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5">
          <DialogBody className="space-y-5">
            <div className="space-y-2">
              {/* `font="normal"`: label is sans, same as the field below (spec § 6.7.1). */}
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
  /** User whose character is being changed; `null` — dialog hidden. */
  user: UserDto | null;
  users: UserDto[];
}

/** Change character by clicking your avatar — same grid (spec § 6.5). */
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

  // The user's current avatar is not "taken" — otherwise it would look unavailable.
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

/** Form error: accent bar instead of a bare red line. */
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
 * Dialog action row: pixel button labels, 44 px touch targets (spec § 6.7.1, § 8).
 * Built on 8bitcn `DialogFooter` to keep all project dialogs visually consistent.
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
