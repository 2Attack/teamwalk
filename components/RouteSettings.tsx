'use client';

import { useState } from 'react';

import { DialogBody, DialogShell } from '@/components/DialogShell';
import { RouteFormDialog } from '@/components/RouteFormDialog';
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
import { ApiError, apiSend, revalidateRoutes, useRoutesAdmin } from '@/lib/client/api';
import { formatKm } from '@/lib/format';
import type { RouteAdminDto } from '@/lib/types';

/**
 * "Team route" settings section (spec § 6.12.3): the catalog table with icon
 * actions. Activation and deletion are only offered where they are legal —
 * the ROUTE_ACTIVE errors stay reachable through the API alone.
 */
export function RouteSettings() {
  const { data, error, isLoading, mutate: reload } = useRoutesAdmin();

  /** Dialog target: `undefined` — closed, `null` — create, a row — edit. */
  const [formTarget, setFormTarget] = useState<RouteAdminDto | null | undefined>(undefined);
  const [activateTarget, setActivateTarget] = useState<RouteAdminDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RouteAdminDto | null>(null);

  const routes = data?.routes;

  return (
    <Card font="normal">
      <CardHeader>
        <CardTitle className="retro text-sm leading-snug break-words sm:text-base">
          Маршрут команды
        </CardTitle>
      </CardHeader>
      <CardContent font="normal" className="space-y-4">
        {error ? (
          <div className="space-y-4">
            <p className="text-sm text-text-dim">
              Не удалось загрузить маршруты. Проверьте подключение и повторите.
            </p>
            <Button type="button" className="min-h-11 text-xs" onClick={() => void reload()}>
              Повторить
            </Button>
          </div>
        ) : isLoading || !routes ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <>
            {routes.length === 0 ? (
              <p className="text-sm text-text-dim">
                Маршрутов пока нет — команда идёт по встроенному. Добавьте свой,
                и он появится на главной.
              </p>
            ) : (
              <div className="w-full [&>div]:w-full">
                <Table font="normal" variant="borderless" className="w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="retro text-[10px] text-text-dim">Название</TableHead>
                      <TableHead className="retro w-px text-right text-[10px] text-text-dim">
                        Городов
                      </TableHead>
                      <TableHead className="retro w-px text-right text-[10px] text-text-dim">
                        Длина
                      </TableHead>
                      <TableHead className="retro text-[10px] text-text-dim">Статус</TableHead>
                      <TableHead className="sr-only">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((route) => (
                      <RouteRow
                        key={route.id}
                        route={route}
                        onEdit={() => setFormTarget(route)}
                        onActivate={() => setActivateTarget(route)}
                        onDelete={() => setDeleteTarget(route)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full text-xs sm:w-auto"
              onClick={() => setFormTarget(null)}
            >
              <Icon name="plus" size={16} />
              Добавить маршрут
            </Button>
          </>
        )}
      </CardContent>

      <RouteFormDialog
        open={formTarget !== undefined}
        route={formTarget ?? null}
        llmEnabled={data?.llmEnabled ?? false}
        onClose={() => setFormTarget(undefined)}
      />

      <ActivateRouteDialog route={activateTarget} onClose={() => setActivateTarget(null)} />
      <DeleteRouteDialog route={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </Card>
  );
}

interface RouteRowProps {
  route: RouteAdminDto;
  onEdit: () => void;
  onActivate: () => void;
  onDelete: () => void;
}

function RouteRow({ route, onEdit, onActivate, onDelete }: RouteRowProps) {
  const lengthKm = route.points[route.points.length - 1]?.km ?? 0;

  return (
    <TableRow>
      <TableCell className="text-sm text-text-main">{route.name}</TableCell>
      <TableCell className="text-right text-sm text-text-main">{route.points.length}</TableCell>
      <TableCell className="text-right text-sm whitespace-nowrap text-text-main">
        {Math.round(lengthKm).toLocaleString('ru-RU')} км
      </TableCell>
      <TableCell>
        <span className="flex flex-col items-start gap-1">
          {route.isActive ? (
            <Badge className="text-[10px]">активный</Badge>
          ) : (
            <span className="text-sm text-text-dim">—</span>
          )}
          {route.progress && (
            <span className="text-xs whitespace-nowrap text-text-dim">
              {formatKm(route.progress.walkedKm)} км
              {route.progress.nextCity ? ` · к ${route.progress.nextCity}` : ' · пройден'}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        <span className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-11"
            aria-label={`Изменить маршрут «${route.name}»`}
            title="Изменить"
            onClick={onEdit}
          >
            <Icon name="edit" size={16} />
          </Button>
          {!route.isActive && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="size-11"
                aria-label={`Выбрать маршрут «${route.name}»`}
                title="Выбрать"
                onClick={onActivate}
              >
                <Icon name="play" size={16} />
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-11"
                aria-label={`Удалить маршрут «${route.name}»`}
                title="Удалить"
                onClick={onDelete}
              >
                <Icon name="trash" size={16} />
              </Button>
            </>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}

interface ActivateRouteDialogProps {
  route: RouteAdminDto | null;
  onClose: () => void;
}

/**
 * Route selection confirmation (spec § 6.12.3): the reset choice defaults to
 * "start from zero" — a fresh route with a full progress bar reads wrong.
 */
function ActivateRouteDialog({ route, onClose }: ActivateRouteDialogProps) {
  const [resetProgress, setResetProgress] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!route) return null;

  async function handleActivate() {
    if (saving || !route) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend('POST', `/api/routes/${route.id}/activate`, { resetProgress });
      await revalidateRoutes();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="retro text-sm leading-snug break-words sm:text-base">
            Сменить маршрут?
          </DialogTitle>
          <DialogDescription>
            Команда переходит на «{route.name}». Полоса на главной покажет его.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <ResetChoice
            selected={resetProgress}
            value
            title="Начать с нуля"
            hint="Прогресс нового маршрута стартует с 0 км — история прогулок не меняется."
            onSelect={setResetProgress}
          />
          <ResetChoice
            selected={!resetProgress}
            value={false}
            title="Продолжить с текущей отметки"
            hint="Уже пройденные командой километры засчитываются и на этом маршруте."
            onSelect={setResetProgress}
          />

          {error && <ActionError text={error} />}
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
            type="button"
            className="min-h-11 w-full text-xs sm:w-auto"
            onClick={() => void handleActivate()}
            disabled={saving}
          >
            {saving ? 'Меняем…' : 'Выбрать'}
          </Button>
        </DialogFooter>
      </DialogShell>
    </Dialog>
  );
}

interface ResetChoiceProps {
  selected: boolean;
  value: boolean;
  title: string;
  hint: string;
  onSelect: (value: boolean) => void;
}

/** A radio rendered as a bordered row: the whole row is the 44px target. */
function ResetChoice({ selected, value, title, hint, onSelect }: ResetChoiceProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={
        selected
          ? 'block w-full border-2 border-citrus px-3 py-2 text-left'
          : 'block w-full border-2 border-border-dim px-3 py-2 text-left'
      }
    >
      <span className="block text-sm text-text-main">{title}</span>
      <span className="mt-1 block text-xs text-text-dim">{hint}</span>
    </button>
  );
}

interface DeleteRouteDialogProps {
  route: RouteAdminDto | null;
  onClose: () => void;
}

function DeleteRouteDialog({ route, onClose }: DeleteRouteDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!route) return null;

  async function handleDelete() {
    if (deleting || !route) return;
    setDeleting(true);
    setError(null);
    try {
      await apiSend('DELETE', `/api/routes/${route.id}`);
      await revalidateRoutes();
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
            Удалить маршрут?
          </DialogTitle>
          <DialogDescription>
            «{route.name}» будет удалён насовсем. Отменить действие нельзя.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">{error && <ActionError text={error} />}</DialogBody>

        <DialogFooter className="gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 w-full text-xs sm:w-auto"
            onClick={onClose}
            disabled={deleting}
          >
            Отмена
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full text-xs sm:w-auto"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? 'Удаляем…' : 'Удалить'}
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
  return 'Не удалось связаться с сервером. Проверьте сеть и повторите.';
}
