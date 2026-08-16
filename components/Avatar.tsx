'use client';

/**
 * Member avatar — 8bitcn `Avatar`, `pixel` variant.
 *
 * Portrait is static DiceBear output from `/public/avatars/{id}.svg`
 * (`npm run gen:assets`). Fallback is required for two cases: the preset was
 * removed from the catalog after release (`isAvatarId` → false) or the file
 * failed to load — a broken image in a leaderboard row looks like an app bug,
 * so a silhouette is drawn instead.
 */
import * as React from 'react';

import { Avatar as BitAvatar, AvatarFallback, AvatarImage } from '@/components/ui/8bit/avatar';
import { avatarSrc, isAvatarId } from '@/lib/avatars';
import { cn } from '@/lib/cn';

export interface AvatarProps {
  avatarId: string;
  /** Member name; sets `alt`. Without it the avatar is decorative. */
  name?: string;
  size?: number;
  className?: string;
}

/**
 * Hides the 8bitcn frame. The library draws it inside the wrapper's first
 * child div and offers no prop to disable it, so the frame container is hidden.
 * The selector also hits Root, but its children include no divs, so nothing breaks.
 */
const NO_FRAME = '[&>div:first-child]:hidden';

/**
 * Square mask instead of round: `variant="pixel"` hardcodes `rounded-full` on
 * both the avatar and the fallback, while zero radius is a project-wide rule
 * (`--radius: 0`). Our classes come after the library's, so
 * tailwind-merge keeps ours.
 */
const SQUARE = 'rounded-none';

/** Neutral silhouette: head and shoulders on a 16×16 pixel grid, no external files. */
function FallbackSilhouette(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden focusable="false">
      <rect width="16" height="16" fill="var(--color-bg-panel)" />
      <rect x="5" y="3" width="6" height="6" fill="var(--color-text-dim)" />
      <rect x="3" y="10" width="10" height="6" fill="var(--color-text-dim)" />
    </svg>
  );
}

export function Avatar({ avatarId, name, size = 40, className }: AvatarProps): React.JSX.Element {
  const known = isAvatarId(avatarId);

  return (
    /*
      This wrapper owns the size, not the component itself: `AvatarPicker`
      stretches the avatar with `h-full!`/`w-full!`, which must land on the same
      element as the numeric size.
    */
    <span className={cn('inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <BitAvatar variant="pixel" font="normal" className={cn('h-full w-full', NO_FRAME, SQUARE)}>
        {known ? (
          <AvatarImage
            src={avatarSrc(avatarId)}
            alt={name ?? ''}
            aria-hidden={name ? undefined : true}
            draggable={false}
            className="pixelated select-none"
          />
        ) : null}
        {/*
          Radix shows the fallback while the image loads and if it fails.
          No `delayMs`: local static assets load too fast to flicker, and an
          empty circle without a fallback would read as a broken avatar.
        */}
        <AvatarFallback className={cn('bg-bg-panel', SQUARE)}>
          <FallbackSilhouette />
        </AvatarFallback>
      </BitAvatar>
    </span>
  );
}
