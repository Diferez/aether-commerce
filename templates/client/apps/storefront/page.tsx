import { Hero, SiteFooter } from "@aether/storefront-default";

/**
 * Default home page - keep this file as-is to use the default skin, or
 * replace its contents with your own composition (you can still import and
 * reuse individual pieces like Hero/SiteFooter, or drop them entirely).
 * See README.md for the full override pattern.
 */
export default function HomePage() {
  return (
    <main>
      <Hero />
      <SiteFooter />
    </main>
  );
}
