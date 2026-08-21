import { humanizeCategorySlug } from "@aether/core";
import { ProductGrid } from "@aether/storefront-default";

// Static export needs generateStaticParams to know which category pages to
// pre-render at build time, and "output: export" refuses to emit zero pages
// for a dynamic segment - a fresh client has no catalog yet, so this ships
// one placeholder slug purely to keep the build valid. Replace with your own
// real category slugs once you have a catalog (see the Aether reference
// repo's apps/storefront/app/categories/[slug]/page.tsx for an example wired
// to a real catalog service).
export function generateStaticParams() {
  return [{ slug: "example" }] as Array<{ slug: string }>;
}

export default async function CategoryProductsPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const categoryName = humanizeCategorySlug(slug);

  return (
    <main>
      <ProductGrid fixedCategory={slug} heading={categoryName} description="Products filtered by category." />
    </main>
  );
}
