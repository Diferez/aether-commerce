import { CategoryGrid, Hero, ProductGrid, SiteFooter } from "@aether/storefront-default";

/**
 * Default home page - keep this file as-is to use the default skin, or
 * replace its contents with your own composition (you can still import and
 * reuse individual pieces like Hero/SiteFooter/CategoryGrid/ProductGrid, or
 * drop them entirely). See README.md for the full override pattern.
 *
 * ProductGrid needs no fallbackProducts prop - if the live catalog API is
 * unreachable it just shows an empty/offline state. Pass your own
 * `fallbackProducts` array if you want an offline demo catalog instead (see
 * apps/storefront/app/products/page.tsx's `demoProducts` for an example).
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <CategoryGrid limit={5} />
      <ProductGrid compact pageSize={4} heading="Featured products" />
      <SiteFooter />
    </main>
  );
}
