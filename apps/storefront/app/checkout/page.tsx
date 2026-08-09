import { CreditCard, ShieldCheck, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { storefrontPath } from "../../components/config";

const checkoutHighlights: Array<[string, string, LucideIcon]> = [
  ["Backend totals", "The Worker recalculates prices, coupons, shipping and inventory.", ShieldCheck],
  ["Stripe test mode", "Checkout uses sandbox keys only and never processes live payments.", CreditCard],
  ["Simulated shipping", "Standard, express and priority options are configured in D1.", Truck]
];

export default function CheckoutPage() {
  return (
    <main className="aether-shell py-8">
      <p className="text-sm font-semibold uppercase text-cyan-300">Checkout</p>
      <h1 className="mt-2 text-4xl font-semibold">Review before Stripe sandbox</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {checkoutHighlights.map(([title, body, Icon]) => (
          <section key={title} className="rounded-lg border border-zinc-200 bg-white p-5">
            <Icon aria-hidden className="text-cyan-300" />
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
          </section>
        ))}
      </div>
      <a href={storefrontPath("/cart")} className="focus-ring mt-6 inline-flex min-h-11 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white">
        Continue from cart
      </a>
    </main>
  );
}
