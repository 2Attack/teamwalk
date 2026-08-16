'use client';

import { useId, useState } from 'react';

import { Button } from '@/components/ui/8bit/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/8bit/card';
import { Input } from '@/components/ui/8bit/input';
import { Label } from '@/components/ui/8bit/label';
import { sanitizeNextPath } from '@/lib/access/pin';
import { m } from '@/lib/i18n';
import { ApiError, apiSend } from '@/lib/client/api';

import type { PinVerifyResponseDto } from '@/lib/types';

interface PinGateFormProps {
  /** Raw `next` query param; sanitized right before navigation. */
  next: string | null;
}

/**
 * Access-gate unlock form (spec 003). Full-page navigation after success so
 * the fresh httpOnly cookie applies to every subsequent request at once.
 */
export function PinGateForm({ next }: PinGateFormProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (checking) return; // guard against double submit

    setChecking(true);
    setError(null);
    try {
      await apiSend<PinVerifyResponseDto>('POST', '/api/pin', { pin });
      window.location.assign(sanitizeNextPath(next));
      // Stay in the busy state: navigation is already in flight.
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : m.common.networkError);
      setChecking(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg-deep p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{m.pin.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-text-dim">{m.pin.prompt}</p>
            <div className="flex flex-col gap-2">
              <Label htmlFor={fieldId} font="normal">
                {m.pin.placeholder}
              </Label>
              <Input
                id={fieldId}
                font="normal"
                type="password"
                autoComplete="current-password"
                placeholder={m.pin.placeholder}
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                aria-invalid={error !== null}
                aria-describedby={error ? errorId : undefined}
                autoFocus
              />
              {error && (
                <p id={errorId} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" disabled={checking || pin.length === 0} className="min-h-11">
              {m.pin.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
