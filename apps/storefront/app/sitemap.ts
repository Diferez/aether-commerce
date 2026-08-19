import type { MetadataRoute } from "next";
import products from "../data/products.json";

// Same origin layout.tsx's own metadataBase already hardcodes - kept
// consistent rather than introducing a second source of truth for it.
const baseUrl = "https://aether-storefront.pickofwow.workers.dev";

type CatalogProductSeed = { slug?: string };

// Every public, indexable page - deliberately excludes /account/*, /cart,
// /checkout, /login, /register (private or transactional, no content of
// value to a crawler - see robots.ts's matching disallow list).
const staticPaths: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/products/", priority: 0.9 },
  { path: "/categories/", priority: 0.7 },
  { path: "/deals/", priority: 0.7 },
  { path: "/featured/", priority: 0.7 },
  { path: "/new-arrivals/", priority: 0.7 },
  { path: "/compare/", priority: 0.4 },
  { path: "/search/", priority: 0.4 },
  { path: "/contact/", priority: 0.3 },
  { path: "/shipping/", priority: 0.3 },
  { path: "/returns/", priority: 0.3 },
  { path: "/terms/", priority: 0.2 },
  { path: "/privacy/", priority: 0.2 },
  { path: "/cookies/", priority: 0.2 },
  { path: "/architecture/", priority: 0.2 },
  { path: "/api-docs/", priority: 0.2 }
];

export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map(({ path, priority }) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority
  }));

  const productEntries: MetadataRoute.Sitemap = (products as CatalogProductSeed[])
    .map((product) => product.slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => ({
      url: `${baseUrl}/products/${slug}/`,
      changeFrequency: "weekly",
      priority: 0.6
    }));

  return [...staticEntries, ...productEntries];
}
