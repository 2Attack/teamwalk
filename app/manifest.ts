import type { MetadataRoute } from 'next';

import { APP_NAME } from '@/lib/config';
import { LOCALE, m } from '@/lib/i18n';

/**
 * Веб-манифест: без него планшет предлагает «добавить ярлык», а не установить
 * приложение, и открывается оно в обычной вкладке с адресной строкой.
 *
 * Next отдаёт этот файл как `/manifest.webmanifest` и сам проставляет
 * `<link rel="manifest">` — руками ссылку в layout добавлять не нужно.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${m.app.titleSuffix}`,
    // На домашнем экране подпись обрезается примерно на 12 символах.
    short_name: APP_NAME,
    description: m.app.description,
    start_url: '/',
    /*
      `standalone`, а не `fullscreen`: приложение живёт на общем планшете, и
      системная шторка с часами и уровнем заряда там нужнее, чем лишние 24 px
      экрана. Адресную строку `standalone` убирает и так.
    */
    display: 'standalone',
    /*
      Совпадает с `--background` из globals.css и с `themeColor` в layout.tsx:
      этим цветом система заливает экран на время запуска, и любое расхождение
      дало бы вспышку другого цвета перед первым кадром.
    */
    background_color: '#17130F',
    theme_color: '#17130F',
    /*
      Ориентацию не фиксируем: планшет у дорожки может стоять и вертикально, и
      горизонтально, а вёрстка резиновая.
    */
    lang: LOCALE,
    dir: 'ltr',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      /*
        Отдельная maskable-иконка обязательна для Android: систему интересует
        своя форма (круг, squircle, капля), и она обрезает под неё. У обычной
        иконки при этом срезало бы края дольки — в maskable-варианте рисунок
        ужат в безопасную зону 60% от стороны.
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
