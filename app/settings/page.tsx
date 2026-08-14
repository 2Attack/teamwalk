'use client';

import Link from 'next/link';

import { RouteSettings } from '@/components/RouteSettings';
import { TreadmillSettings } from '@/components/TreadmillSettings';

/**
 * Settings screen (spec § 6.11): a page rather than a dialog — the sections
 * are CRUD lists with dialogs of their own. No authorization by design
 * (spec § 7.9). Sections: treadmills (§ 6.11.2) and the team route (§ 6.12).
 */
export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b-[3px] border-border-dim pb-4">
        <h1 className="font-pixel text-base leading-none sm:text-2xl">Настройки</h1>
        <Link
          href="/"
          className="font-pixel flex min-h-11 items-center text-xs text-text-dim transition-colors hover:text-text-main focus-visible:text-text-main"
        >
          ← На главную
        </Link>
      </header>

      <TreadmillSettings />
      <RouteSettings />
    </main>
  );
}
