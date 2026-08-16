import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, Viewport } from 'next';
import { Inter, Press_Start_2P } from 'next/font/google';

import { APP_NAME, IS_VERCEL_PREVIEW } from '@/lib/config';
import { cn } from '@/lib/cn';
import { LOCALE, m } from '@/lib/i18n';

import './globals.css';

/*
  Both fonts ship the 'cyrillic' subset — names would fall apart on «Ё», «Й»,
  «Щ» otherwise (spec § 6.7.2) — plus 'latin-ext' for Spanish diacritics.
  Geist, the shadcn default, is not used: it has no Cyrillic.
*/
const pixel = Press_Start_2P({
  weight: '400',
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-pixel-family',
  display: 'swap',
});

const ui = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-ui-family',
  display: 'swap',
});

export const metadata: Metadata = {
  /* On Vercel preview deploys the title is tagged "PREVIEW" so the tab can't be
     mistaken for prod (AppHeader tags the header the same way). */
  title: IS_VERCEL_PREVIEW ? `${APP_NAME} — PREVIEW` : `${APP_NAME} — ${m.app.titleSuffix}`,
  description: m.app.description,
  /*
    iOS ignores the manifest and reads install mode from its own meta tags:
    without `capable` a home-screen shortcut would open as a plain Safari tab.
    `black-translucent` lets the dark `--background` extend under the status
    bar, hiding the seam.
  */
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#17130F',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* Static `dark`: the MVP has no light theme; the class enables 8bitcn's
       dark:-variants. */
    <html lang={LOCALE} className={cn('dark', pixel.variable, ui.variable)}>
      <body className="min-h-dvh antialiased">
        {children}
        {/* Vercel Analytics: page views and visitors. */}
        <Analytics />
        {/* Vercel Speed Insights: Web Vitals from prod (our budget — spec § 8). */}
        <SpeedInsights />
      </body>
    </html>
  );
}
