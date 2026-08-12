import { TZ } from './config';

/** Форматирование чисел, времени и нормализация имён. Общее для клиента и сервера. */

/** `00:14:32` либо `14:32`, если меньше часа (п. 6.3). */
export function formatDuration(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** `14 мин 32 сек` — человекочитаемая длительность для модалки завершения. */
export function formatDurationHuman(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} ч`);
  if (m > 0 || h > 0) parts.push(`${m} мин`);
  parts.push(`${s} сек`);
  return parts.join(' ');
}

/** Километры с двумя знаками: `1.25`. */
export function formatKm(km: number | string | null | undefined): string {
  const value = typeof km === 'string' ? Number(km) : (km ?? 0);
  if (!Number.isFinite(value)) return '0.00';
  return value.toFixed(2);
}

/** `09:14` в офисном часовом поясе. */
export function formatTimeOfDay(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** `11 августа` — для хинтов и истории. */
export function formatDate(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long' }).format(
    date,
  );
}

/**
 * Нормализация имени перед сохранением (п. 6.2):
 * trim → схлопывание пробелов → первая буква каждого слова заглавная.
 * `егор  иванов` → `Егор Иванов`.
 */
export function normalizeName(raw: string): string {
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  return collapsed
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) =>
          part.length === 0 ? part : part[0].toLocaleUpperCase('ru-RU') + part.slice(1),
        )
        .join('-'),
    )
    .join(' ');
}

/** Ключ регистронезависимого сравнения — тот же, что в users_name_uniq. */
export function nameKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

/** Расчётная дистанция по скорости и длительности, округление до 0.01 (п. 6.4). */
export function calcDistanceKm(speedKmh: number, durationSec: number): number {
  return Math.round(((speedKmh * durationSec) / 3600) * 100) / 100;
}

/** Отрезок постоянной скорости: `startedAt` — момент, с которого она действует. */
interface SpeedSegmentLike {
  speedKmh: number;
  startedAt: string;
}

/**
 * Дистанция по отрезкам скорости (п. 6.3): каждый отрезок идёт до начала
 * следующего, последний — до `endMs`.
 *
 * Смена скорости не переписывает пройденное: 10 минут при 6 км/ч остаются
 * километром, даже если дальше человек сбросил темп до 3. Округление одно, в
 * самом конце — иначе на десятке смен накапливалась бы ошибка в сотых.
 */
export function calcSegmentedDistanceKm(
  segments: readonly SpeedSegmentLike[],
  endMs: number,
): number {
  let km = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const startMs = new Date(segments[i].startedAt).getTime();
    const next = segments[i + 1];
    const stopMs = next === undefined ? endMs : new Date(next.startedAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(stopMs)) continue;

    // Отрицательная длительность возможна только при рассинхроне часов — не вычитаем.
    const seconds = Math.max(0, (Math.min(stopMs, endMs) - startMs) / 1000);
    km += (segments[i].speedKmh * seconds) / 3600;
  }

  return Math.round(km * 100) / 100;
}

/** Больше — уже не подпись, а строка данных: сворачиваем до «откуда → куда». */
const SPEED_TRAIL_MAX = 4;

/** `4 км/ч`, `4 → 6 → 5 км/ч`, а на длинной череде смен — `4 → … → 3 км/ч`. */
export function formatSpeedTrail(speeds: readonly number[]): string {
  if (speeds.length === 0) return '—';
  if (speeds.length <= SPEED_TRAIL_MAX) return `${speeds.join(' → ')} км/ч`;
  return `${speeds[0]} → … → ${speeds[speeds.length - 1]} км/ч`;
}

/** Фактическая средняя скорость: км / часы. `0`, если времени нет. */
export function avgSpeedKmh(totalKm: number, totalDurationSec: number): number {
  if (totalDurationSec <= 0) return 0;
  return Math.round((totalKm / (totalDurationSec / 3600)) * 100) / 100;
}

/** Склонение русских существительных: `plural(5, 'день', 'дня', 'дней')`. */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

/** Принимает `1.25` и `1,25`, возвращает число либо null (п. 6.4). */
export function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(normalized) || normalized === '' || normalized === '.') return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
