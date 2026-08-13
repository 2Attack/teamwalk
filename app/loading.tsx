import LoadingScreenBlock from '@/components/ui/8bit/blocks/loading-screen';
import { STATIC_HINTS } from '@/lib/hints/registry';

/**
 * Межстраничная загрузка (route-level): тот же игровой загрузочный экран,
 * что и на экране прогулки, только во весь вьюпорт. Советы — статический
 * каталог хинтов (п. 6.6.6): без порядка не тасуем, чтобы серверный рендер
 * не расходился с гидратацией.
 */
export default function Loading() {
  return (
    <LoadingScreenBlock
      variant="fullscreen"
      title="ЗАГРУЗКА"
      tips={STATIC_HINTS.map((hint) => hint.text)}
      autoProgress
      autoProgressDuration={2000}
      tipInterval={4000}
    />
  );
}
