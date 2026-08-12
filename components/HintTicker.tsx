'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/8bit/alert';
import { Icon } from '@/components/ui/icon';
import { useHints } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import type { HintDto } from '@/lib/types';

interface HintTickerProps {
  userId?: string | null;
  variant?: 'home' | 'walk';
  className?: string;
}

/** Интервалы смены (п. 6.6.10): главная — 7 с, дорожка — 10 с, reduced-motion — 12 с. */
const INTERVAL_MS = { home: 7_000, walk: 10_000, reduced: 12_000 } as const;
/** Печать не должна съедать паузу на чтение: 20 мс на символ, но не дольше 2.4 с всего. */
const TYPE_CHAR_MS = 20;
const TYPE_TOTAL_MAX_MS = 2_400;

/** По контракту API пул непуст, но пустая панель выглядела бы как поломка. */
const FALLBACK: HintDto = {
  id: 'fallback',
  tone: 'neutral',
  text: 'Дорожка свободна. Хорошего шага!',
  source: 'static',
};

/** Фишер — Йетс над копией: исходный пул не мутируется. */
function shuffle(items: readonly HintDto[]): HintDto[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

/** Новый круг: тасуем заново и следим, чтобы первая фраза не повторила последнюю. */
function reshuffle(items: readonly HintDto[], lastId: string | null): HintDto[] {
  const next = shuffle(items);
  if (next.length > 1 && next[0].id === lastId) return [next[1], next[0], ...next.slice(2)];
  return next;
}

/**
 * Число уже «напечатанных» символов фразы.
 *
 * Раньше печать собиралась из отдельных CSS-анимаций на каждый символ с растущим
 * `animation-delay`. На фразе в 80–140 символов это 80–140 одновременных анимаций,
 * которые перезапускались каждые 7 секунд, и хвост строки просто переставал
 * доигрывать: фраза навсегда обрывалась на полуслове, а невидимый хвост держал
 * своё место в строке — отсюда и «дыры» в ленте. Здесь один таймер и один
 * счётчик, поэтому печать всегда доходит до конца.
 */
function useTypedCount(text: string, enabled: boolean): number {
  const total = text.length;
  const [count, setCount] = useState(enabled ? 0 : total);

  useEffect(() => {
    if (!enabled) {
      setCount(total);
      return;
    }
    setCount(0);
    if (total === 0) return;

    // Печать не должна съедать паузу на чтение: 20 мс на символ, но не дольше 2.4 с всего.
    const stepMs = Math.max(1, Math.min(TYPE_CHAR_MS, TYPE_TOTAL_MAX_MS / total));
    const timer = window.setInterval(() => {
      setCount((value) => {
        if (value >= total) {
          window.clearInterval(timer);
          return total;
        }
        return value + 1;
      });
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [text, total, enabled]);

  return count;
}

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/**
 * Диалоговое окно NPC (п. 6.7.5) на `Alert` из 8bitcn: «уши» по углам рамки —
 * та самая рамка диалогового окна. Текст фразы набран пиксельным шрифтом
 * (`font="retro"`) — как реплика NPC в консольной игре.
 *
 * Плата за это — высота блока. У Press Start 2P ширина глифа равна кеглю, то
 * есть символов в строке ровно `ширина / font-size`, а фраза бывает до 140
 * символов: на телефоне это 6–7 строк вместо прежних двух. Высота задана в `lh`
 * (строках) и зафиксирована по худшему случаю, чтобы смена фразы не дёргала
 * вёрстку; на коротких фразах низ окна остаётся пустым — для диалогового окна
 * это нормально. `hyphens-auto` (у html стоит lang="ru") убирает рваный правый
 * край, из-за которого моноширинный текст терял бы ещё строку.
 *
 * В один момент в разметке живёт ровно один `<p>`: смена фразы — это смена `key`,
 * то есть размонтирование старого абзаца и монтирование нового. Кросс-фейда между
 * фразами нет сознательно — на нём две фразы накладывались друг на друга в одном
 * блоке фиксированной высоты, и лента читалась как каша из обрывков.
 */
export function HintTicker({ userId = null, variant = 'home', className }: HintTickerProps) {
  const { data } = useHints(userId ?? null);
  const reduced = useReducedMotionPreference();
  // Наведение и фокус считаются раздельно: иначе уход мыши снимал бы паузу
  // с фразы, которую пользователь читает, держа фокус на панели с клавиатуры.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [order, setOrder] = useState<HintDto[]>([]);
  const [index, setIndex] = useState(0);

  const pool = useMemo<HintDto[]>(() => (data?.hints.length ? data.hints : [FALLBACK]), [data]);
  const poolKey = pool.map((hint) => hint.id).join('|');

  // Пул целиком обновляется раз в несколько минут — сверяем по составу id.
  useEffect(() => {
    setOrder(shuffle(pool));
    setIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey]);

  const current = order[index] ?? pool[0];

  /** Перебор по кругу без повторов: круг заканчивается — пул тасуется заново. */
  const advance = useCallback(() => {
    if (index + 1 < order.length) {
      setIndex(index + 1);
      return;
    }
    setOrder(reshuffle(pool, order[index]?.id ?? null));
    setIndex(0);
  }, [index, order, pool]);

  const intervalMs = reduced ? INTERVAL_MS.reduced : INTERVAL_MS[variant];
  const paused = hovered || focused;

  useEffect(() => {
    if (paused || order.length < 2) return;
    // Таймер пересоздаётся после каждой смены, поэтому снятие паузы
    // всегда даёт полный интервал на чтение, а не остаток предыдущего.
    const timer = window.setInterval(advance, intervalMs);
    return () => window.clearInterval(timer);
  }, [paused, order.length, intervalMs, advance]);

  const text = current?.text ?? '';
  // `prefers-reduced-motion` глушит печать целиком — фраза появляется сразу (п. 6.8.4).
  const typed = useTypedCount(text, !reduced);
  const isWalk = variant === 'walk';

  return (
    <section
      aria-label="Лента подсказок"
      className={cn('w-full', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Alert
        font="retro"
        /*
          `Alert` приходит с `role="alert"`, а у этой роли подразумеваемое
          `aria-live` — `assertive`. Для ленты, которая сама меняется каждые
          7 секунд, это означало бы, что скринридер перебивает пользователя на
          каждой фразе. Явный `aria-live="off"` перекрывает подразумеваемое
          значение роли (п. 6.8.4).
        */
        aria-live="off"
        aria-atomic="false"
        // Иконка обёрнута в <span>, поэтому колоночный вариант базового Alert
        // (он ищет прямого потомка-<svg>) сам не включится: задаём сетку
        // «иконка + текст» явно.
        className="grid-cols-[auto_1fr] items-start gap-x-3 px-4 py-4"
      >
        {/* Иконка диалогового окна NPC — из общего пиксельного набора (п. 6.7.4). */}
        <Icon name="hint" size={isWalk ? 24 : 16} className="mt-0.5" />

        <AlertDescription
          className={cn(
            /*
              Высота окна считается в `lh` (строках), поэтому строка контейнера
              обязана совпасть со строкой абзаца внутри — иначе «4 строки» окна
              и 4 строки текста окажутся разной высоты. Совпадение приходится
              задавать через `!`: базовый `AlertDescription` навязывает абзацу
              свой межстрочный селектором `[&_p]`, а `text-xs` тянет за собой
              собственный line-height — обе величины перебиваются явной.

              Кегль — компромисс между читаемостью и высотой окна: на телефоне
              минимум, при котором Press Start 2P ещё читается, на широком
              экране крупнее (на дорожке фразу читают с полутора метров,
              п. 6.6.10). Число строк взято по худшей фразе в 140 символов,
              поэтому смена хинта не дёргает вёрстку.
            */
            'block min-w-0 overflow-hidden text-text-main leading-[1.7]!',
            /*
              Кегль растёт с `md`, а не с `sm`: на 640 px колонка ещё узкая, и
              прибавка кегля именно там даёт худший случай переносов (6 строк
              против 4). К 768 px ширины уже хватает.
            */
            isWalk ? 'text-xs md:text-base' : 'text-[10px] md:text-xs',
            'h-[7lh] md:h-[4lh]',
          )}
        >
          <p
            key={current.id}
            // Межстрочный повторяет родительский (и тоже через `!`): высота окна
            // задана в его строках, а базовый `AlertDescription` иначе поставит
            // абзацу свой.
            className="m-0 hyphens-auto break-words leading-[1.7]!"
          >
            {text.slice(0, typed)}
            {/*
              Ненапечатанный хвост остаётся в потоке невидимым: перенос строк
              считается по фразе целиком и по ходу печати не съезжает, поэтому
              строка не переверстывается на каждом символе (п. 6.7.6).
            */}
            <span aria-hidden="true" className="invisible">
              {text.slice(typed)}
            </span>
          </p>
        </AlertDescription>
      </Alert>
    </section>
  );
}
