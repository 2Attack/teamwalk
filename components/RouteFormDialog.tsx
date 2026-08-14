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
import { Icon } from '@/components/ui/icon';
import { ApiError, apiSend, revalidateRoutes } from '@/lib/client/api';
import { ROUTE_POINTS_MAX } from '@/lib/config';
import type { RouteAdminDto, RouteCityDto, RouteDraftDto } from '@/lib/types';
import { routePointsSchema, treadmillNameSchema } from '@/lib/validation';

interface RouteFormDialogProps {
  open: boolean;
  /** `null` — create mode; a row — edit mode. */
  route: RouteAdminDto | null;
  /** LLM credentials are configured — show the AI drafting row (spec § 6.12.4). */
  llmEnabled: boolean;
  onClose: () => void;
}

interface PointDraft {
  city: string;
  km: string;
}

const EMPTY_POINTS: PointDraft[] = [
  { city: '', km: '0' },
  { city: '', km: '' },
];

/**
 * Route editor (spec § 6.12.3): name + point rows, one dialog for create and
 * edit. The first row is the start pinned to km 0. Points are sorted by km on
 * save and sent wholesale — the API replaces the array atomically.
 */
export function RouteFormDialog({ open, route, llmEnabled, onClose }: RouteFormDialogProps) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;

  const [name, setName] = useState('');
  const [points, setPoints] = useState<PointDraft[]>(EMPTY_POINTS);
  const [nameError, setNameError] = useState<string | null>(null);
  /** Per-row error, aligned with `points` by index (spec § 6.12.3). */
  const [rowErrors, setRowErrors] = useState<Array<string | null>>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(route?.name ?? '');
    setPoints(
      route
        ? route.points.map((p) => ({ city: p.city, km: String(p.km) }))
        : EMPTY_POINTS.map((p) => ({ ...p })),
    );
    setNameError(null);
    setRowErrors([]);
    setListError(null);
    setFormError(null);
    setAiPrompt('');
    setAiError(null);
    setMapError(null);
  }, [open, route]);

  function setPoint(index: number, patch: Partial<PointDraft>) {
    setPoints((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function addPoint() {
    setPoints((prev) =>
      prev.length >= ROUTE_POINTS_MAX ? prev : [...prev, { city: '', km: '' }],
    );
  }

  function removePoint(index: number) {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  }

  /** Row-by-row validation, then the shared whole-array schema. */
  function validate(): RouteCityDto[] | null {
    const errors: Array<string | null> = points.map((point, index) => {
      const city = treadmillNameSchema.safeParse(point.city);
      if (!city.success) return city.error.issues[0]?.message ?? 'Некорректное название';
      if (!/^\d+$/.test(point.km.trim())) {
        return index === 0 ? null : 'Километры — целое число';
      }
      return null;
    });
    setRowErrors(errors);
    if (errors.some((e) => e !== null)) {
      setListError(null);
      return null;
    }

    const parsedPoints = points
      .map((p) => ({ city: p.city, km: Number(p.km.trim() || '0') }))
      .sort((a, b) => a.km - b.km);
    const list = routePointsSchema.safeParse(parsedPoints);
    if (!list.success) {
      setListError(list.error.issues[0]?.message ?? 'Проверьте точки маршрута');
      return null;
    }
    setListError(null);
    return list.data;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const parsedName = treadmillNameSchema.safeParse(name);
    setNameError(parsedName.success ? null : (parsedName.error.issues[0]?.message ?? null));
    const parsedPoints = validate();
    if (!parsedName.success || !parsedPoints) return;

    setSaving(true);
    setFormError(null);
    try {
      if (route) {
        await apiSend<RouteAdminDto>('PATCH', `/api/routes/${route.id}`, {
          name: parsedName.data,
          points: parsedPoints,
        });
      } else {
        await apiSend<RouteAdminDto>('POST', '/api/routes', {
          name: parsedName.data,
          points: parsedPoints,
        });
      }
      await revalidateRoutes();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'NAME_TAKEN') {
        setNameError(error.message);
      } else {
        setFormError(errorText(error));
      }
    } finally {
      setSaving(false);
    }
  }

  /** AI draft (spec § 6.12.4): fills the editor, never writes to the DB. */
  async function handleGenerate() {
    if (aiBusy || aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const draft = await apiSend<RouteDraftDto>('POST', '/api/routes/generate', {
        prompt: aiPrompt,
      });
      setName(draft.name);
      setPoints(draft.points.map((p) => ({ city: p.city, km: String(p.km) })));
      setRowErrors([]);
      setListError(null);
      setNameError(null);
    } catch (error) {
      setAiError(errorText(error));
    } finally {
      setAiBusy(false);
    }
  }

  /** On-demand AI map layout for an existing route (spec § 6.12.5). */
  async function handleRegenerateMap() {
    if (mapBusy || !route) return;
    setMapBusy(true);
    setMapError(null);
    try {
      await apiSend<RouteAdminDto>('POST', `/api/routes/${route.id}/map`);
      await revalidateRoutes();
    } catch (error) {
      setMapError(errorText(error));
    } finally {
      setMapBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="retro text-sm leading-snug break-words sm:text-base">
            {route ? 'Изменить маршрут' : 'Новый маршрут'}
          </DialogTitle>
          <DialogDescription>
            Города с накопительными километрами от старта. Расстояния ориентировочные.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-5">
          <DialogBody className="space-y-5">
            {llmEnabled && (
              <div className="space-y-2">
                <Label
                  htmlFor={`${fieldId}-ai`}
                  font="normal"
                  className="block text-sm text-text-dim"
                >
                  Опишите маршрут
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`${fieldId}-ai`}
                    font="normal"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="например: от Ярославля до Токио"
                    className="min-h-11 w-full text-base"
                    maxLength={300}
                    disabled={aiBusy}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11 shrink-0 text-xs"
                    onClick={() => void handleGenerate()}
                    disabled={aiBusy || aiPrompt.trim().length < 3}
                  >
                    {aiBusy ? 'Генерируем…' : 'Сгенерировать'}
                  </Button>
                </div>
                {aiError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {aiError}
                  </p>
                ) : (
                  <p className="text-xs text-text-dim">
                    ИИ заполнит черновик — города и километры можно поправить перед сохранением.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={nameId} font="normal" className="block text-sm text-text-dim">
                Название *
              </Label>
              <Input
                id={nameId}
                font="normal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={nameError !== null}
                className="min-h-11 w-full text-base"
                maxLength={60}
                autoComplete="off"
              />
              {nameError && (
                <p role="alert" className="text-sm text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm text-text-dim">Города и километры от старта</p>
              {points.map((point, index) => (
                <PointRow
                  key={index}
                  index={index}
                  point={point}
                  error={rowErrors[index] ?? null}
                  removable={index > 0 && points.length > 2}
                  onChange={(patch) => setPoint(index, patch)}
                  onRemove={() => removePoint(index)}
                />
              ))}

              {listError && (
                <p role="alert" className="text-sm text-destructive">
                  {listError}
                </p>
              )}

              <Button
                type="button"
                variant="secondary"
                className="min-h-11 text-xs"
                onClick={addPoint}
                disabled={points.length >= ROUTE_POINTS_MAX}
              >
                <Icon name="plus" size={16} />
                Добавить город
              </Button>
            </div>

            {llmEnabled && route && (
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 text-xs"
                  onClick={() => void handleRegenerateMap()}
                  disabled={mapBusy}
                >
                  {mapBusy ? 'Рисуем карту…' : 'Перегенерировать карту'}
                </Button>
                {mapError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {mapError}
                  </p>
                ) : (
                  <p className="text-xs text-text-dim">
                    Карта на главной: {route.hasMapLayout ? 'раскладка ИИ' : 'автоматическая раскладка'}.
                  </p>
                )}
              </div>
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
              disabled={saving}
            >
              {saving ? 'Сохраняем…' : route ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogShell>
    </Dialog>
  );
}

interface PointRowProps {
  index: number;
  point: PointDraft;
  error: string | null;
  removable: boolean;
  onChange: (patch: Partial<PointDraft>) => void;
  onRemove: () => void;
}

function PointRow({ index, point, error, removable, onChange, onRemove }: PointRowProps) {
  const isStart = index === 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Input
          font="normal"
          value={point.city}
          onChange={(e) => onChange({ city: e.target.value })}
          placeholder={isStart ? 'Старт' : 'Город'}
          aria-label={isStart ? 'Стартовый город' : `Город ${index + 1}`}
          aria-invalid={error !== null}
          className="min-h-11 w-full text-base"
          maxLength={60}
          autoComplete="off"
        />
        <Input
          font="normal"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={isStart ? '0' : point.km}
          onChange={(e) => onChange({ km: e.target.value })}
          aria-label={`Километры до точки ${index + 1}`}
          // The start is pinned to 0 km (spec § 6.12.3).
          disabled={isStart}
          className="min-h-11 w-24 shrink-0 text-base"
        />
        {removable ? (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="size-11 shrink-0"
            aria-label={`Убрать город ${point.city || index + 1}`}
            title="Убрать"
            onClick={onRemove}
          >
            <Icon name="trash" size={16} />
          </Button>
        ) : (
          /* A spacer keeps the km column aligned when the row has no button. */
          <span aria-hidden className="size-11 shrink-0" />
        )}
      </div>
      {isStart && <p className="text-xs text-text-dim">Старт — всегда 0 км.</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Human error text: the API message or a neutral fallback. */
function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Не удалось связаться с сервером. Проверьте сеть и повторите.';
}
