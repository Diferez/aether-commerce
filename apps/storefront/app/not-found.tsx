import { StorefrontLink } from "../components/StorefrontLink";

export default function NotFound() {
  return (
    <main className="aether-shell py-8">
      <section className="rounded-lg border border-zinc-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold uppercase text-accent">404</p>
        <h1 className="mt-2 text-4xl font-semibold text-zinc-950">Page not found</h1>
        <p className="mx-auto mt-3 max-w-xl text-zinc-600">The page may have moved or the link may be outdated.</p>
        <StorefrontLink href="/" className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-white">
          Back to storefront
        </StorefrontLink>
      </section>
    </main>
  );
}
