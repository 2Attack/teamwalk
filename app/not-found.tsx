import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="font-pixel text-3xl text-citrus">404</p>
      <p className="text-text-dim">
        Такой страницы нет. Дорожка тоже не в курсе, куда вы попали.
      </p>
      <Link
        href="/"
        className="pixel-btn font-pixel min-h-11 bg-lime px-6 py-3 text-base text-bg-deep"
      >
        На главную
      </Link>
    </main>
  );
}
