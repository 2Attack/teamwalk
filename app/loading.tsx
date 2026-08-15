import LoadingScreenBlock from '@/components/ui/8bit/blocks/loading-screen';
import { STATIC_HINTS } from '@/lib/hints/registry';
import { m } from '@/lib/i18n';

/**
 * Route-level loading: the walk screen's game-style loading screen, fullscreen.
 * Tips come from the static hint catalog (spec § 6.6.6), unshuffled so server
 * render matches hydration.
 */
export default function Loading() {
  return (
    <LoadingScreenBlock
      variant="fullscreen"
      title={m.common.loading}
      tips={STATIC_HINTS.map((hint) => hint.text)}
      autoProgress
      autoProgressDuration={2000}
      tipInterval={4000}
    />
  );
}
