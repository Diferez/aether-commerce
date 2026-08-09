const endpoints = [
  ["GET", "/api/v1/catalog/products", "Paginated normalized products"],
  ["GET", "/api/v1/catalog/products/:slug", "Product detail"],
  ["GET", "/api/v1/cart/:id/token", "Issue signed cart token for protected cart reads and mutations"],
  ["POST", "/api/v1/cart/:id/items", "Add item with server recalculation and x-aether-cart-token"],
  ["POST", "/api/v1/checkout/session", "Create Stripe test checkout"],
  ["POST", "/api/v1/contact", "Log contact and queue Resend email"],
  ["POST", "/api/v1/webhooks/stripe", "Signed idempotent Stripe webhook"]
];

export default function ApiDocsPage() {
  return (
    <main className="aether-shell py-8">
      <p className="text-sm font-semibold uppercase text-teal-700">API docs</p>
      <h1 className="mt-2 text-4xl font-semibold text-zinc-950">Aether API v1</h1>
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white">
        {endpoints.map(([method, path, description]) => (
          <div key={path} className="grid gap-2 border-b border-zinc-200 p-4 last:border-b-0 md:grid-cols-[90px_1fr_1fr]">
            <span className="w-fit rounded-md bg-zinc-950 px-2 py-1 text-xs font-semibold text-white">{method}</span>
            <code className="text-sm font-semibold text-zinc-950">{path}</code>
            <p className="text-sm text-zinc-600">{description}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
