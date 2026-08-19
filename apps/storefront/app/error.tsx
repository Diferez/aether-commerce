"use client";

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="aether-shell py-8">
      <section className="rounded-lg border border-rose-200 bg-rose-50 p-6">
        <p className="text-sm font-semibold uppercase text-rose-700">Storefront error</p>
        <h1 className="mt-2 text-3xl font-semibold text-rose-950">This section could not be rendered.</h1>
        <p className="mt-3 text-sm text-rose-800">Try again. If the problem persists, check the browser console and API status.</p>
        <button
          type="button"
          onClick={reset}
          className="focus-ring mt-5 inline-flex min-h-11 items-center rounded-md bg-rose-900 px-4 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </section>
    </main>
  );
}
