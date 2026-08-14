/**
 * 8-битные звуки интерфейса: синтез Web Audio API, без аудиофайлов и внешних
 * запросов (правило «в рантайме сторонних запросов нет»).
 *
 * Все функции безопасны по построению: молчат в фоновой вкладке (звук из
 * невидимой вкладки пугает), глотают заблокированный AudioContext без ошибок
 * в консоли и закрывают контекст после проигрывания. Громкость сознательно
 * низкая — это офис.
 */

interface Note {
  /** 0 — пауза: время идёт, осциллятор не создаётся. */
  freqHz: number;
  durSec: number;
}

const GAIN = 0.04;

function playNotes(notes: readonly Note[], wave: OscillatorType = 'square'): void {
  if (typeof window === 'undefined' || document.hidden) return;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = GAIN;
    gain.connect(ctx.destination);

    let at = 0;
    for (const { freqHz, durSec } of notes) {
      if (freqHz > 0) {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = freqHz;
        osc.connect(gain);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + durSec);
      }
      at += durSec;
    }

    // Контекст одноразовый: закрываем после хвоста последней ноты.
    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, (at + 0.15) * 1000);
  } catch {
    // Автоплей заблокирован или API урезан — интерфейс работает и без звука.
  }
}

/**
 * Фанфара выдачи достижения (п. 6.8.3): «та-да-да…ДА» — быстрый взлёт,
 * пауза-вдох и длинная высокая финальная. Волна — треугольная (канал NES).
 */
export function playFanfare(): void {
  playNotes(
    [
      { freqHz: 784, durSec: 0.07 },
      { freqHz: 1046, durSec: 0.07 },
      { freqHz: 1318, durSec: 0.07 },
      { freqHz: 0, durSec: 0.05 },
      { freqHz: 1568, durSec: 0.3 },
    ],
    'triangle',
  );
}
