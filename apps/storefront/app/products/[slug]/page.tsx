import type { Metadata } from "next";
import products from "../../../data/products.json";
import { ProductDetailClient } from "./ProductDetailClient";

type CatalogProductSeed = {
  slug?: string;
  name?: string;
  shortDescription?: string;
  images?: { main?: string };
};

export function generateStaticParams() {
  return (products as CatalogProductSeed[])
    .map((product) => product.slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => ({ slug }));
}

// Static export has no per-request server, so this runs once at build time
// against the same bundled seed data generateStaticParams uses (never the
// live API) - the live catalog can override title/description per product
// (details.seoTitle/seoDescription in apps/api/src/services/catalog.ts),
// but this seed never carries those overrides, so the fallback formula here
// deliberately matches the API's own default exactly: `${name} | Aether`
// and the first 150 characters of the short description.
export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const product = (products as CatalogProductSeed[]).find((candidate) => candidate.slug === slug);
    if (!product?.name) return {};
    const title = `${product.name} | Aether`;
    const description = (product.shortDescription ?? "").slice(0, 150);
    const canonicalPath = `/products/${slug}/`;
    return {
      title,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: {
        title,
        description,
        type: "website",
        url: canonicalPath,
        ...(product.images?.main ? { images: [{ url: product.images.main }] } : {})
      }
    };
  });
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProductDetailClient slug={slug} />;
}
