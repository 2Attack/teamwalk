'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/8bit/alert';
import { Button } from '@/components/ui/8bit/button';
import { Icon } from '@/components/ui/icon';
import { TelegramLinkDialog } from '@/components/TelegramLinkDialog';
import { apiSend, useTelegramStatus } from '@/lib/client/api';
import { m } from '@/lib/i18n';

interface TelegramNudgeProps {
  userId: string;
}

/**
 * "Link Telegram" panel on the active-walk screen (spec § 6.10.2).
 *
 * Visible while the member is unlinked (and the subsystem is enabled) — no
 * counters or cooldowns. Two events remove it: linking, and "don't show again"
 * (the dismissal is stored in the DB per member, works from any device, and is
 * reset by unlinking). "Connect" opens the QR/link dialog (spec § 6.10.3).
 */
export function TelegramNudge({ userId }: TelegramNudgeProps) {
  const { data: status, mutate: mutateStatus } = useTelegramStatus(userId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const dismissForever = () => {
    if (status === undefined) return;
    // Hide first (optimistic mutate), then tell the server: the dismissal must
    // apply instantly, and a write error is no reason to bring the panel back.
    void mutateStatus({ ...status, dismissed: true }, { revalidate: false });
    void apiSend<unknown>('POST', `/api/users/${userId}/telegram/dismiss`).catch(
      () => undefined,
    );
  };

  // No panel until the server responds: flashing and vanishing is worse than late.
  if (status === undefined || !status.enabled || status.linked || status.dismissed) return null;

  return (
    <section
      aria-label={m.telegram.nudgeAria}
      // px-1.5 — room for the Alert frame's side pixels.
      className="px-1.5"
    >
      {/* 8bitcn Alert draws its own pixel frame; font="normal" — pixel font goes
          only on the title, body text is regular sans (spec § 6.7.1). */}
      <Alert font="normal" className="flex flex-col gap-2 bg-bg-panel p-3">
        <AlertTitle className="flex items-center gap-2 font-pixel text-[12px] leading-none text-citrus">
          {/* Speech bubble from the shared pixel set — it's the bot talking (spec § 6.7.4). */}
          <Icon name="hint" size={16} />
          {m.telegram.nudgeTitle}
        </AlertTitle>

        <AlertDescription className="w-full text-sm leading-relaxed text-text-main">
          <p>{m.telegram.nudgeBody}</p>

          <div className="flex w-full flex-col gap-1 pt-1">
            <Button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="min-h-11 w-full"
            >
              {m.telegram.connect}
            </Button>
            <Button
              variant="ghost"
              font="normal"
              type="button"
              onClick={dismissForever}
              className="min-h-11 w-full text-sm text-text-dim"
            >
              {m.telegram.dontShowAgain}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <TelegramLinkDialog
        open={dialogOpen}
        userId={userId}
        onClose={() => setDialogOpen(false)}
      />
    </section>
  );
}
