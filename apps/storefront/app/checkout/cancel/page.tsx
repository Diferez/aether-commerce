export default function CheckoutCancelPage() {
  return (
    <main className="aether-shell py-12">
      <section className="rounded-lg border border-zinc-200 bg-white p-6">
        <p className="text-sm font-semibold uppercase text-amber-300">Checkout cancelled</p>
        <h1 className="mt-2 text-4xl font-semibold">No payment was processed</h1>
        <p className="mt-4 text-zinc-600">The cart remains available and inventory reservations can be released safely.</p>
      </section>
    </main>
  );
}
