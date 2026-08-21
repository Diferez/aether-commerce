import { humanizeCategorySlug } from "@aether/core";
import { ProductGrid } from "@aether/storefront-default";

// Static export needs generateStaticParams to know which category pages to
// pre-render at build time. Empty here since a fresh client has no catalog
// yet - list your own real category slugs once you do (see the Aether
// reference repo's apps/storefront/app/categories/[slug]/page.tsx for an
// example wired to a real catalog service).
export function generateStaticParams() {
  return [] as Array<{ slug: string }>;
}

export default async function CategoryProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const categoryName = humanizeCategorySlug(slug);

  return (
    <main>
      <ProductGrid fixedCategory={slug} heading={categoryName} description="Products filtered by category." />
    </main>
  );
}
