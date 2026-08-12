'use client';

import { useEffect } from 'react';

/** Глобальная граница ошибок: сбой не должен выглядеть как белый экран. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ui] unhandled error', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-pixel text-2xl text-citrus">Ошибка</p>
      <p className="text-text-dim">
        Что-то пошло не так. Данные прогулок в безопасности — попробуйте обновить экран.
      </p>
      <button
        type="button"
        onClick={reset}
        className="pixel-btn font-pixel min-h-11 bg-citrus px-6 py-3 text-base text-bg-deep"
      >
        Обновить
      </button>
    </main>
  );
}
