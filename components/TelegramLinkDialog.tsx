'use client';

import { useEffect, useState } from 'react';

import QRCode from 'qrcode';

import { DialogBody, DialogShell } from '@/components/DialogShell';
import { Button } from '@/components/ui/8bit/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/8bit/dialog';
import { apiSend, useTelegramStatus } from '@/lib/client/api';
import { m } from '@/lib/i18n';
import type { TelegramLinkTokenDto } from '@/lib/types';

interface TelegramLinkDialogProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

/**
 * Telegram linking dialog (spec § 6.10.3): deep-link QR code plus a link below.
 *
 * Typical case: the user is on the treadmill with a laptop while Telegram is
 * on their phone — the QR moves the link across devices without typing. The
 * link below is for Telegram on the same device.
 *
 * While open, the status is re-polled every few seconds: linking finishes in
 * another app, and "it closed by itself, so it worked" is the only feedback
 * possible without auth.
 */
export function TelegramLinkDialog({ open, userId, onClose }: TelegramLinkDialogProps) {
  const { data: status, mutate: mutateStatus } = useTelegramStatus(userId);

  const [link, setLink] = useState<TelegramLinkTokenDto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Token request counter: bumping it re-runs the loading effect.
  const [attempt, setAttempt] = useState(0);

  // Fresh token on every open: the old one's TTL (15 min) may have expired.
  useEffect(() => {
    if (!open) return;
    setLink(null);
    setQrDataUrl(null);
    setError(null);

    let cancelled = false;
    void apiSend<TelegramLinkTokenDto>('POST', `/api/users/${userId}/telegram/link-token`)
      .then((dto) => {
        if (!cancelled) setLink(dto);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : m.telegram.linkFailed,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId, attempt]);

  // QR is rendered client-side from the fetched link — no external requests
  // (generator services would break the "no third-party requests at runtime" rule).
  // Black modules on white: a dark-theme inversion scans worse.
  useEffect(() => {
    if (link === null) return;
    let cancelled = false;
    void QRCode.toDataURL(link.url, {
      errorCorrectionLevel: 'M',
      margin: 0,
      scale: 8,
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        // QR is an enhancer, not the only path: the link below works without it.
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [link]);

  // Poll status while the dialog is open: linked — close. Also swap an expired
  // token instead of letting the user scan a dead QR.
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      void mutateStatus();
      if (link !== null && Date.parse(link.expiresAt) <= Date.now()) {
        setAttempt((n) => n + 1);
      }
    };
    const timer = window.setInterval(tick, 4_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, link, mutateStatus]);

  useEffect(() => {
    if (open && status?.linked === true) onClose();
  }, [open, status?.linked, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) onClose();
      }}
    >
      <DialogShell>
        <DialogHeader>
          <DialogTitle className="text-[16px] leading-relaxed">{m.telegram.dialogTitle}</DialogTitle>
          <DialogDescription className="font-sans">
            {m.telegram.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col items-center gap-4">
          {error !== null ? (
            <>
              <p role="alert" className="text-sm text-citrus">
                {error}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => setAttempt((n) => n + 1)}
              >
                {m.telegram.tryAgain}
              </Button>
            </>
          ) : (
            <>
              {/* White backing is mandatory: the camera needs a quiet zone around the code. */}
              <div className="flex size-56 items-center justify-center bg-white p-3">
                {qrDataUrl !== null ? (
                  /* A locally generated data URL is not a next/image candidate. */
                  <img
                    src={qrDataUrl}
                    alt={m.telegram.qrAlt}
                    className="size-full [image-rendering:pixelated]"
                  />
                ) : (
                  <p className="text-center font-sans text-sm text-neutral-500">
                    {link === null ? m.telegram.gettingLink : m.telegram.qrFailed}
                  </p>
                )}
              </div>

              {link !== null ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 text-center font-sans text-sm text-citrus underline underline-offset-4"
                >
                  {m.telegram.linkOnThisDevice}
                </a>
              ) : null}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="secondary"
            type="button"
            onClick={onClose}
            className="min-h-11 w-full sm:w-auto"
          >
            {m.common.close}
          </Button>
        </DialogFooter>
      </DialogShell>
    </Dialog>
  );
}
