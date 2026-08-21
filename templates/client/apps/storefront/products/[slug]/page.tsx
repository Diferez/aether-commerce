import { ProductDetailClient } from "@aether/storefront-default";

// Static export needs generateStaticParams to know which product pages to
// pre-render at build time. Empty here since a fresh client has no catalog
// yet - generate real slugs from your own catalog data once you do (see
// the Aether reference repo's apps/storefront/app/products/[slug]/page.tsx,
// which reads its build-time seed from data/products.json).
export function generateStaticParams() {
  return [] as Array<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} fallbackProduct={null} />;
}
