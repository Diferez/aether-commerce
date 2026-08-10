export default function Loading() {
  return (
    <main className="aether-shell py-8" aria-live="polite" aria-busy="true">
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton mt-4 h-24 rounded" />
      </section>
    </main>
  );
}
