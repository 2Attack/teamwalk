import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata, Viewport } from 'next';
import { Inter, Press_Start_2P } from 'next/font/google';

import { APP_NAME } from '@/lib/config';
import { cn } from '@/lib/cn';

import './globals.css';

/*
  Кириллица проверена до включения в макет (п. 6.7.2): у обоих шрифтов
  подключён subset 'cyrillic', иначе имена рассыпались бы на «Ё», «Й», «Щ».
  Geist, который предлагает shadcn по умолчанию, не ставим: кириллицы в нём
  нет, а интерфейс целиком русский.
*/
const pixel = Press_Start_2P({
  weight: '400',
  subsets: ['latin', 'cyrillic'],
  variable: '--font-pixel-family',
  display: 'swap',
});

const ui = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-ui-family',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${APP_NAME} — трекер ходьбы`,
  description: 'Корпоративный трекер ходьбы на беговой дорожке',
  /*
    iOS манифест игнорирует и режим установки читает из своих мета-тегов: без
    `capable` ярлык на домашнем экране открывался бы обычной вкладкой Safari с
    адресной строкой. `title` задаёт подпись под ярлыком, а `black-translucent`
    пускает фон приложения под системную шторку — у нас под неё уходит тёмный
    `--background`, и стык не виден.
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
    /* `dark` статичен: приложение живёт в тёмном углу опенспейса и светлой темы
       в MVP не имеет — класс нужен, чтобы работали dark:-варианты 8bitcn. */
    <html lang="ru" className={cn('dark', pixel.variable, ui.variable)}>
      <body className="min-h-dvh antialiased">
        {children}
        {/* Vercel Speed Insights: метрики Web Vitals с прода (наш бюджет — п. 8 ТЗ). */}
        <SpeedInsights />
      </body>
    </html>
  );
}
