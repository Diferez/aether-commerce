export function generateStaticParams() {
  return [{ id: "AET-DEMO" }];
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="aether-shell py-8">
      <h1 className="text-4xl font-semibold">Order {id}</h1>
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <p className="text-zinc-600">Tracking, payment status and order state history are stored through the Worker API.</p>
      </div>
    </main>
  );
}
