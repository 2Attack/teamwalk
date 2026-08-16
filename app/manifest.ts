import type { MetadataRoute } from 'next';

import { APP_NAME } from '@/lib/config';
import { LOCALE, m } from '@/lib/i18n';

/**
 * Web manifest: without it the tablet offers a bookmark instead of an app
 * install. Next serves this as `/manifest.webmanifest` and injects
 * `<link rel="manifest">` itself.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${m.app.titleSuffix}`,
    // Home-screen label truncates around 12 characters.
    short_name: APP_NAME,
    description: m.app.description,
    start_url: '/',
    /*
      `standalone`, not `fullscreen`: on a shared tablet the system status bar
      (clock, battery) matters more than 24 extra px; `standalone` already
      hides the address bar.
    */
    display: 'standalone',
    /*
      Must match `--background` in globals.css and `themeColor` in layout.tsx:
      the OS paints this color during launch, and any mismatch flashes before
      the first frame.
    */
    background_color: '#17130F',
    theme_color: '#17130F',
    // Orientation not locked: the tablet may stand either way; layout is fluid.
    lang: LOCALE,
    dir: 'ltr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /*
        Separate maskable icon is required for Android: the OS crops to its own
        shape, which would clip the regular icon — the maskable variant keeps
        the artwork inside the 60% safe zone.
      */
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
