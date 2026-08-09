import { getInventoryStatus, humanizeCategorySlug } from "@aether/core";
import { productSchema, type Product, type ProductQuery } from "@aether/schemas";
import type { Env } from "../types";
import localProducts from "../data/products.json";

type LocalProduct = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  price: number;
  compareAtPrice?: number;
  currency: "USD";
  stock: number;
  rating: number;
  reviewCount: number;
  shortDescription: string;
  description: string;
  highlights: string[];
  specs: Record<string, string>;
  tags: string[];
  variants: Array<{ type: string; options: string[] }>;
  images: { main: string; gallery: string[] };
  imagePrompt: string;
  featured: boolean;
  isNew: boolean;
  createdAt: string;
};

const typedLocalProducts = localProducts as LocalProduct[];

export const catalogCacheKey = "local-products-v1";
const memoryCacheTtlMs = 5 * 60 * 1000;
let memoryCatalogCache: { expiresAt: number; products: Product[] } | null = null;

function storefrontOrigin(env: Env) {
  return env.APP_ORIGIN_STORE ?? "http://localhost:3000";
}

function absoluteImageUrl(env: Env, imagePath: string) {
  const basePath = (env.APP_STORE_BASE_PATH ?? "").replace(/\/$/, "");
  return `${storefrontOrigin(env)}${basePath}${imagePath}`;
}

function flagsFor(product: LocalProduct): Product["flags"] {
  const flags: Product["flags"] = [];
  if (product.featured) flags.push("featured");
  if (product.isNew) flags.push("new");
  if (product.compareAtPrice) flags.push("deal");
  if (product.stock > 0 && product.stock <= 6) flags.push("limited");
  return flags.length > 0 ? flags : ["featured"];
}

function normalizeLocal(env: Env, product: LocalProduct): Product {
  // The local catalog's `price` is what the customer pays today; the (older,
  // higher) `compareAtPrice` - when present - is the struck-through reference
  // price. The shared Product contract inherited the opposite direction from
  // its DummyJSON origin (`price` = pre-discount, `finalPrice` = what's
  // charged), so the two are swapped here to land in the right fields.
  const finalPrice = Math.round(product.price * 100);
  const price = product.compareAtPrice ? Math.round(product.compareAtPrice * 100) : finalPrice;
  const discountPercentage = product.compareAtPrice
    ? Math.max(0, Math.min(95, Math.round((1 - product.price / product.compareAtPrice) * 100)))
    : 0;

  const categoryName = humanizeCategorySlug(product.category);
  const availableStock = Math.max(0, product.stock);
  const availabilityStatus = getInventoryStatus(availableStock, 4);

  const images: Product["images"] = [product.images.main, ...product.images.gallery].map((imagePath, index) => ({
    url: absoluteImageUrl(env, imagePath),
    alt: `${product.name} image ${index + 1}`,
    source: "local"
  }));

  const flags = flagsFor(product);
  const now = new Date().toISOString();
  const specifications = Object.entries(product.specs).map(([key, value]) => ({ key, value }));
  const primaryVariant = product.variants[0];

  return productSchema.parse({
    id: product.id,
    externalId: null,
    sourceId: String(Number(product.id.replace(/\D/g, "")) || 0),
    slug: product.slug,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    price,
    originalPrice: product.compareAtPrice ? price : null,
    finalPrice,
    discountPercentage,
    currency: "USD",
    category: {
      id: product.category,
      externalId: null,
      slug: product.category,
      name: categoryName,
      image: images[0]?.url ?? null
    },
    sku: product.sku,
    brand: product.brand,
    tags: [product.category, product.subcategory, ...product.tags, ...flags],
    initialStock: availableStock,
    reservedStock: 0,
    soldStock: 0,
    returnedStock: 0,
    adjustedStock: 0,
    availableStock,
    availabilityStatus: availabilityStatus === "hidden" ? "discontinued" : availabilityStatus,
    thumbnail: images[0]?.url ?? absoluteImageUrl(env, product.images.main),
    images,
    gallery: images.map((image) => image.url),
    specifications,
    flags,
    seo: {
      title: `${product.name} | Aether`,
      description: product.shortDescription.slice(0, 150),
      canonicalPath: `/products/${product.slug}`
    },
    variants: primaryVariant
      ? primaryVariant.options.map((option, index) => ({
          id: `${product.slug}-${option.toLowerCase().replace(/\s+/g, "-")}`,
          name: primaryVariant.type,
          value: option,
          priceAdjustment: 0,
          stockAdjustment: 0,
          label: option,
          sku: `${product.sku}-${index + 1}`,
          priceDelta: 0,
          inventory: availableStock,
          attributes: { [primaryVariant.type]: option }
        }))
      : [],
    rating: {
      average: product.rating,
      count: product.reviewCount
    },
    reviewCount: product.reviewCount,
    reviews: [],
    inventory: {
      sku: product.sku,
      available: availableStock,
      reserved: 0,
      lowStockThreshold: 4,
      status: getInventoryStatus(availableStock, 4)
    },
    visibility: "visible",
    featured: flags.includes("featured"),
    newArrival: flags.includes("new"),
    deal: flags.includes("deal"),
    visible: true,
    seoTitle: `${product.name} | Aether`,
    seoDescription: product.shortDescription.slice(0, 150),
    catalogSource: "local",
    externalStock: null,
    lastSyncedAt: now,
    shippingInformation: null,
    warrantyInformation: null,
    returnPolicy: null,
    minimumOrderQuantity: null,
    weight: null,
    dimensions: null,
    createdAt: new Date(product.createdAt).toISOString(),
    updatedAt: now
  });
}

async function readCachedProducts(env: Env): Promise<Product[] | null> {
  if (memoryCatalogCache && memoryCatalogCache.expiresAt > Date.now()) {
    return memoryCatalogCache.products;
  }

  try {
    const row = await env.DB.prepare(
      "select payload_json from products_cache where id = ? and expires_at > datetime('now')"
    )
      .bind(catalogCacheKey)
      .first<{ payload_json: string }>();
    if (!row) {
      return null;
    }
    const products = JSON.parse(row.payload_json) as Product[];
    memoryCatalogCache = { products, expiresAt: Date.now() + memoryCacheTtlMs };
    return products;
  } catch {
    return null;
  }
}

async function writeCachedProducts(env: Env, products: Product[]) {
  try {
    await env.DB.prepare(
      `insert into products_cache (id, source, payload_json, expires_at, created_at, updated_at)
       values (?, 'local', ?, datetime('now', '+15 minutes'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(id) do update set source = 'local', payload_json = excluded.payload_json, expires_at = excluded.expires_at, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(catalogCacheKey, JSON.stringify(products))
      .run();
    memoryCatalogCache = { products, expiresAt: Date.now() + memoryCacheTtlMs };
  } catch {
    // Cache failures should never block the storefront.
  }
}

async function getCatalogSource(env: Env) {
  const cached = await readCachedProducts(env);
  if (cached) {
    return cached.filter((product) => product.visibility === "visible");
  }

  const source = typedLocalProducts.map((product) => normalizeLocal(env, product));
  await writeCachedProducts(env, source);
  return source.filter((product) => product.visibility === "visible");
}

// Strips diacritics for accent-insensitive search (e.g. "camara" matches "cámara").
function foldText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export async function getCatalogProducts(env: Env, query: ProductQuery) {
  let products = await getCatalogSource(env);

  const search = query.search ?? query.q;
  if (search) {
    const needle = foldText(search);
    products = products.filter((product) => {
      const haystack = [product.name, product.brand ?? "", product.shortDescription, ...product.tags].join(" ");
      return foldText(haystack).includes(needle);
    });
  }

  if (query.category) {
    products = products.filter((product) => product.category.slug === query.category);
  }

  if (query.brand) {
    const needle = query.brand.toLowerCase();
    products = products.filter((product) => (product.brand ?? "").toLowerCase() === needle);
  }

  const flag = query.flag;
  if (flag) {
    products = products.filter((product) => product.flags.includes(flag));
  }
  if (query.featured) {
    products = products.filter((product) => product.featured);
  }
  if (query.deal) {
    products = products.filter((product) => product.deal);
  }
  if (query.newArrival) {
    products = products.filter((product) => product.newArrival);
  }
  if (query.inStock) {
    products = products.filter((product) => product.availableStock > 0);
  }
  if (query.hasDiscount) {
    products = products.filter((product) => product.discountPercentage > 0);
  }

  const minPrice = query.minPrice;
  if (minPrice !== undefined) {
    products = products.filter((product) => product.finalPrice >= minPrice);
  }

  const maxPrice = query.maxPrice;
  if (maxPrice !== undefined) {
    products = products.filter((product) => product.finalPrice <= maxPrice);
  }

  const minRating = query.minRating;
  if (minRating !== undefined) {
    products = products.filter((product) => product.rating.average >= minRating);
  }

  products = products.sort((a, b) => {
    if (query.sort === "price_asc") return a.finalPrice - b.finalPrice;
    if (query.sort === "price_desc") return b.finalPrice - a.finalPrice;
    if (query.sort === "rating") return b.rating.average - a.rating.average;
    if (query.sort === "name") return a.name.localeCompare(b.name);
    if (query.sort === "discount") return b.discountPercentage - a.discountPercentage;
    if (query.sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return Number(b.flags.includes("featured")) - Number(a.flags.includes("featured"));
  });

  const total = products.length;
  const pageSize = query.limit ?? query.pageSize;
  const start = (query.page - 1) * pageSize;
  const data = products.slice(start, start + pageSize);

  return {
    data,
    pagination: {
      page: query.page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize)
    }
  };
}

export async function getProductBySlug(env: Env, slug: string) {
  const data = await getCatalogSource(env);
  return data.find((product) => product.slug === slug);
}

export async function getProductById(env: Env, id: string) {
  const data = await getCatalogSource(env);
  return data.find((product) => product.id === id || String(product.externalId) === id);
}

export async function getCategories(env: Env) {
  const data = await getCatalogSource(env);
  const map = new Map<string, Product["category"]>();
  data.forEach((product) => map.set(product.category.slug, product.category));
  return [...map.values()];
}

// One pass over the already-cached catalog source instead of one filtered
// query per category - lets callers show per-category counts (e.g. a
// category grid) without firing N separate requests.
export async function getCategoryCounts(env: Env) {
  const data = await getCatalogSource(env);
  const counts = new Map<string, number>();
  data.forEach((product) => {
    const slug = product.category.slug;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  });
  return [...counts.entries()].map(([slug, count]) => ({ slug, count }));
}

export async function clearCatalogCache(env: Env) {
  memoryCatalogCache = null;
  try {
    await env.DB.prepare("delete from products_cache where id = ?").bind(catalogCacheKey).run();
  } catch {
    // Best-effort - a stale cache row just means a slower next read, not a failure.
  }
}

export async function getBrands(env: Env) {
  const data = await getCatalogSource(env);
  const brands = new Set<string>();
  data.forEach((product) => {
    if (product.brand) {
      brands.add(product.brand);
    }
  });
  return [...brands].sort((a, b) => a.localeCompare(b));
}

// Exported for characterization tests only - not part of the public catalog API surface.
export const __testables = {
  normalizeLocal,
  flagsFor,
  foldText,
  typedLocalProducts
};
