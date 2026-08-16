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
import { fmt, m } from '@/lib/i18n';
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
      if (!city.success) return city.error.issues[0]?.message ?? m.routes.invalidName;
      if (!/^\d+$/.test(point.km.trim())) {
        return index === 0 ? null : m.routes.kmInteger;
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
      setListError(list.error.issues[0]?.message ?? m.routes.pointsInvalid);
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

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="retro text-sm leading-snug break-words sm:text-base">
            {route ? m.routes.formEditTitle : m.routes.formNewTitle}
          </DialogTitle>
          <DialogDescription>{m.routes.formDescription}</DialogDescription>
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
                  {m.routes.aiLabel}
                </Label>
                {/* The input takes the full dialog width; the action sits on
                    its own row below — a long description needs the room. */}
                <Input
                  id={`${fieldId}-ai`}
                  font="normal"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={m.routes.aiPlaceholder}
                  className="min-h-11 w-full text-base"
                  maxLength={300}
                  disabled={aiBusy}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full text-xs"
                  onClick={() => void handleGenerate()}
                  disabled={aiBusy || aiPrompt.trim().length < 3}
                >
                  {aiBusy ? m.routes.aiGenerating : m.routes.aiGenerate}
                </Button>
                {aiError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {aiError}
                  </p>
                ) : (
                  <p className="text-xs text-text-dim">{m.routes.aiHint}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={nameId} font="normal" className="block text-sm text-text-dim">
                {m.routes.nameLabel}
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
              <p className="text-sm text-text-dim">{m.routes.pointsLabel}</p>
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
                {m.routes.addCity}
              </Button>
            </div>

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
              {m.common.cancel}
            </Button>
            <Button
              type="submit"
              className="min-h-11 w-full text-xs sm:w-auto"
              disabled={saving}
            >
              {saving ? m.common.saving : route ? m.common.save : m.common.create}
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
          placeholder={isStart ? m.routes.startPlaceholder : m.routes.cityPlaceholder}
          aria-label={isStart ? m.routes.startCityAria : fmt(m.routes.cityAria, { index: index + 1 })}
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
          aria-label={fmt(m.routes.kmToPointAria, { index: index + 1 })}
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
            aria-label={fmt(m.routes.removeCityAria, { name: point.city || index + 1 })}
            title={m.routes.removeCityTitle}
            onClick={onRemove}
          >
            <Icon name="trash" size={16} />
          </Button>
        ) : (
          /* A spacer keeps the km column aligned when the row has no button. */
          <span aria-hidden className="size-11 shrink-0" />
        )}
      </div>
      {isStart && <p className="text-xs text-text-dim">{m.routes.startAlwaysZero}</p>}
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
  return m.common.networkError;
}
