'use client';

import { useEffect } from 'react';

/**
 * Не даёт экрану гаснуть, пока приложение открыто (Screen Wake Lock API).
 *
 * Зачем: приложение живёт на планшете у беговой дорожки. Пока человек идёт,
 * экран с таймером никто не трогает, и через минуту-другую планшет его гасит —
 * а это ровно тот экран, ради которого он там висит.
 *
 * Блокировка снимается системой сама, как только вкладка уходит в фон (это часть
 * спецификации, а не сбой), поэтому её приходится брать заново по
 * `visibilitychange`. Без этого экран переставал бы держаться после любого
 * переключения приложений.
 *
 * Ничего не рендерит и ни на что не влияет там, где API нет: Wake Lock требует
 * защищённого контекста, так что на http-стенде (кроме localhost) его просто не
 * существует, и компонент тихо ничего не делает.
 */
export function KeepScreenAwake() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    // Эффект может быть размонтирован, пока `request` ещё в полёте: без флага
    // блокировка досталась бы уже мёртвому компоненту и осталась висеть.
    let stopped = false;

    async function acquire() {
      if (stopped || document.visibilityState !== 'visible') return;
      // Уже держим живую блокировку — второй запрос дал бы второй sentinel,
      // и снять при размонтировании мы смогли бы только последний.
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (stopped) {
          await sentinel.release();
          sentinel = null;
        }
      } catch {
        /*
          Отказ — штатный исход, а не ошибка: батарея на исходе, включён режим
          энергосбережения, пользователь запретил. Гаснущий экран неприятен, но
          это не повод показывать сообщение поверх таймера.
        */
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
      sentinel = null;
    };
  }, []);

  return null;
}
