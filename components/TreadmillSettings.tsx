'use client';

import { useState } from 'react';

import { DialogBody, DialogShell } from '@/components/DialogShell';
import { TreadmillFormDialog } from '@/components/TreadmillFormDialog';
import { Badge } from '@/components/ui/8bit/badge';
import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/8bit/dialog';
import { Skeleton } from '@/components/ui/8bit/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/8bit/table';
import { Icon } from '@/components/ui/icon';
import { ApiError, apiSend, revalidateTreadmills, useTreadmillsAdmin } from '@/lib/client/api';
import { fmt, m } from '@/lib/i18n';
import type { TreadmillAdminDto } from '@/lib/types';

/**
 * "Treadmills" settings section: the full list — inactive
 * included — with per-row actions. The second action depends on walksCount:
 * "delete" for a treadmill nothing references, "toggle active" otherwise.
 */
export function TreadmillSettings() {
  const { data: treadmills, error, isLoading, mutate: reload } = useTreadmillsAdmin();

  /** Dialog target: `undefined` — closed, `null` — create, a row — edit. */
  const [formTarget, setFormTarget] = useState<TreadmillAdminDto | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<TreadmillAdminDto | null>(null);
  /** Rows with an in-flight quick toggle — their buttons are disabled. */
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggleActive(treadmill: TreadmillAdminDto) {
    if (togglingIds.has(treadmill.id)) return;
    setTogglingIds((prev) => new Set(prev).add(treadmill.id));
    setActionError(null);
    try {
      await apiSend('PATCH', `/api/treadmills/${treadmill.id}`, {
        isActive: !treadmill.isActive,
      });
      await revalidateTreadmills();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(treadmill.id);
        return next;
      });
    }
  }

  return (
    <Card font="normal">
      <CardHeader>
        <CardTitle className="retro text-sm leading-snug break-words sm:text-base">
          {m.treadmills.title}
        </CardTitle>
      </CardHeader>
      <CardContent font="normal" className="space-y-4">
        {error ? (
          <div className="space-y-4">
            <p className="text-sm text-text-dim">{m.treadmills.loadFailed}</p>
            <Button type="button" className="min-h-11 text-xs" onClick={() => void reload()}>
              {m.common.retry}
            </Button>
          </div>
        ) : isLoading || !treadmills ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {treadmills.length === 0 ? (
              <p className="text-sm text-text-dim">{m.treadmills.empty}</p>
            ) : (
              /*
                The 8bit Table wrapper is `w-fit`; the `[&>div]:w-full` override
                stretches it to the card so the base shadcn container (already
                `overflow-x-auto`) owns the horizontal scroll on narrow screens.
              */
              /*
                `borderless`: the card already draws a pixel frame, and the
                default table frame (thick borders + p-4) both doubled it and
                stole the width the actions column needs.
              */
              <div className="w-full [&>div]:w-full">
                <Table font="normal" variant="borderless" className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="retro text-[10px] text-text-dim">{m.treadmills.colName}</TableHead>
                      <TableHead className="retro w-px text-right text-[10px] text-text-dim">
                        {m.treadmills.colKmh}
                      </TableHead>
                      <TableHead className="retro w-px text-right text-[10px] text-text-dim">
                        {m.treadmills.colWalks}
                      </TableHead>
                      <TableHead className="retro text-[10px] text-text-dim">{m.treadmills.colStatus}</TableHead>
                      <TableHead className="sr-only">{m.treadmills.colActions}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {treadmills.map((treadmill) => (
                      <TreadmillRow
                        key={treadmill.id}
                        treadmill={treadmill}
                        toggling={togglingIds.has(treadmill.id)}
                        onEdit={() => setFormTarget(treadmill)}
                        onDelete={() => setDeleteTarget(treadmill)}
                        onToggleActive={() => void toggleActive(treadmill)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {actionError && <ActionError text={actionError} />}

            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full text-xs sm:w-auto"
              onClick={() => setFormTarget(null)}
            >
              <Icon name="plus" size={16} />
              {m.treadmills.add}
            </Button>
          </>
        )}
      </CardContent>

      <TreadmillFormDialog
        open={formTarget !== undefined}
        treadmill={formTarget ?? null}
        onClose={() => setFormTarget(undefined)}
      />

      <DeleteTreadmillDialog
        treadmill={deleteTarget}
        treadmills={treadmills ?? []}
        onClose={() => setDeleteTarget(null)}
      />
    </Card>
  );
}

interface TreadmillRowProps {
  treadmill: TreadmillAdminDto;
  toggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

/** One table row: data cells are sans, actions sit in the last cell. */
function TreadmillRow({ treadmill, toggling, onEdit, onDelete, onToggleActive }: TreadmillRowProps) {
  return (
    <TableRow>
      <TableCell className="text-sm text-text-main">{treadmill.name}</TableCell>
      <TableCell className="text-right text-sm text-text-main">
        {treadmill.maxSpeedKmh}
      </TableCell>
      <TableCell className="text-right text-sm text-text-main">
        {treadmill.walksCount}
      </TableCell>
      <TableCell>
        {/* Occupancy goes on its own line: inline it pushed the actions column
            out of the card on ordinary desktop widths. */}
        <span className="flex flex-col items-start gap-1">
          {treadmill.isActive ? (
            <Badge className="text-[10px]">{m.treadmills.badgeActive}</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              {m.treadmills.badgeInactive}
            </Badge>
          )}
          {treadmill.busy && (
            <span className="text-sm text-citrus">{fmt(m.treadmills.busyWith, { name: treadmill.busy.user.name })}</span>
          )}
        </span>
      </TableCell>
      <TableCell>
        {/* Icon-only actions: the icon is decorative (aria-hidden), so every
            button carries an aria-label and a matching title tooltip. */}
        <span className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-11"
            aria-label={fmt(m.treadmills.editAria, { name: treadmill.name })}
            title={m.treadmills.editTitle}
            onClick={onEdit}
          >
            <Icon name="edit" size={16} />
          </Button>
          {treadmill.walksCount === 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="size-11"
              aria-label={fmt(m.treadmills.deleteAria, { name: treadmill.name })}
              title={m.treadmills.deleteTitle}
              onClick={onDelete}
            >
              <Icon name="trash" size={16} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-11"
              disabled={toggling}
              aria-label={fmt(
                treadmill.isActive ? m.treadmills.turnOffAria : m.treadmills.turnOnAria,
                { name: treadmill.name },
              )}
              title={treadmill.isActive ? m.treadmills.turnOffTitle : m.treadmills.turnOnTitle}
              onClick={onToggleActive}
            >
              <Icon name={treadmill.isActive ? 'powerOff' : 'power'} size={16} />
            </Button>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}

interface DeleteTreadmillDialogProps {
  /** `null` — the dialog is closed. */
  treadmill: TreadmillAdminDto | null;
  treadmills: TreadmillAdminDto[];
  onClose: () => void;
}

/** Deletion confirmation: only reachable for walk-free treadmills. */
function DeleteTreadmillDialog({ treadmill, treadmills, onClose }: DeleteTreadmillDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!treadmill) return null;

  // Warn when this is the last active treadmill: home will show the
  // "no treadmills right now" empty state after deletion.
  const lastActive =
    treadmill.isActive && treadmills.filter((t) => t.isActive).length === 1;

  async function handleDelete() {
    if (deleting || !treadmill) return;
    setDeleting(true);
    setError(null);
    try {
      await apiSend('DELETE', `/api/treadmills/${treadmill.id}`);
      await revalidateTreadmills();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="retro text-sm leading-snug break-words sm:text-base">
            {m.treadmills.deleteConfirmTitle}
          </DialogTitle>
          <DialogDescription>
            {fmt(m.treadmills.deleteConfirmBody, { name: treadmill.name })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {lastActive && (
            <p className="text-sm text-text-dim">{m.treadmills.deleteLastActiveWarn}</p>
          )}
          {error && <ActionError text={error} />}
        </DialogBody>

        <DialogFooter className="gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full text-xs sm:w-auto"
            onClick={onClose}
            disabled={deleting}
          >
            {m.common.cancel}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full text-xs sm:w-auto"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? m.common.deleting : m.common.delete}
          </Button>
        </DialogFooter>
      </DialogShell>
    </Dialog>
  );
}

/** Form-level error: an accent bar instead of a bare red line. */
function ActionError({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="border-l-[3px] border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {text}
    </p>
  );
}

/** Human error text: the API message or a neutral fallback. */
function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return m.common.networkError;
}
