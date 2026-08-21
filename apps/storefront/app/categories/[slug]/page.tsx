import { humanizeCategorySlug } from "@aether-commerce/core";
import { ProductGrid } from "../../../components/ProductGrid";
import { demoProducts } from "../../../components/demo-products";

// The 10 real category slugs in the local catalog (see
// apps/storefront/data/products.json and apps/api/src/services/catalog.ts).
export function generateStaticParams() {
  return [
    "smartphones",
    "laptops",
    "mobile-accessories",
    "tablets",
    "mens-watches",
    "womens-watches",
    "sunglasses",
    "furniture",
    "home-decoration",
    "sports-accessories"
  ].map((slug) => ({ slug }));
}

export default async function CategoryProductsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const categoryName = humanizeCategorySlug(slug);

  return (
    <main>
      <ProductGrid
        fixedCategory={slug}
        heading={categoryName}
        description="Products filtered by category through the Aether Catalog Adapter."
        fallbackProducts={demoProducts}
      />
    </main>
  );
}
