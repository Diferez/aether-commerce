import products from "../../../data/products.json";
import { ProductDetailClient } from "./ProductDetailClient";

type CatalogProductSeed = {
  slug?: string;
};

export function generateStaticParams() {
  return (products as CatalogProductSeed[])
    .map((product) => product.slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => ({ slug }));
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}
