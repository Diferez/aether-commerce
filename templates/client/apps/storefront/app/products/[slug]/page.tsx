import { ProductDetailClient } from "@aether/storefront-default";

// Static export needs generateStaticParams to know which product pages to
// pre-render at build time, and "output: export" refuses to emit zero pages
// for a dynamic segment - a fresh client has no catalog yet, so this ships
// one placeholder slug purely to keep the build valid. Replace with real
// slugs from your own catalog data once you have one (see the Aether
// reference repo's apps/storefront/app/products/[slug]/page.tsx, which reads
// its build-time seed from data/products.json).
export function generateStaticParams() {
  return [{ slug: "example" }] as Array<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} fallbackProduct={null} />;
}
