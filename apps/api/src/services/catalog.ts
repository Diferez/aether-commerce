import { getInventoryStatus, humanizeCategorySlug } from "@aether/core";
import { productSchema, type Product, type ProductQuery } from "@aether/schemas";
import type { Env } from "../types";

export type ProductDetails = {
  shortDescription: string;
  description: string;
  highlights: string[];
  specs: Record<string, string>;
  tags: string[];
  variants: Array<{ type: string; options: string[] }>;
  images: { main: string; gallery: string[] };
  imagePrompt?: string;
  // Optional admin overrides - normalizeRow falls back to a name/
  // shortDescription-derived default when either is absent, same behavior
  // as before these existed. Explicit `| undefined` (not just `?:`) because
  // exactOptionalPropertyTypes distinguishes "key absent" from "key present
  // with value undefined", and callers build this object from optional input.
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
};

export type ProductRow = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  subcategory: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  final_price_cents: number;
  stock: number;
  low_stock_threshold: number;
  visibility: "draft" | "visible" | "hidden";
  featured: number;
  is_new: number;
  is_deal: number;
  rating_average: number;
  rating_count: number;
  details_json: string;
  created_at: string;
  updated_at: string;
};

export const catalogCacheKey = "products-v2";
const memoryCacheTtlMs = 5 * 60 * 1000;
let memoryCatalogCache: { expiresAt: number; products: Product[] } | null = null;

function storefrontOrigin(env: Env) {
  return env.APP_ORIGIN_STORE ?? "http://localhost:3000";
}

// Cloudinary/external image URLs already resolve on their own; only bare
// paths (the bundled demo catalog's /products/*.webp assets) need the
// storefront origin prefixed onto them.
function absoluteImageUrl(env: Env, imagePath: string) {
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const basePath = (env.APP_STORE_BASE_PATH ?? "").replace(/\/$/, "");
  return `${storefrontOrigin(env)}${basePath}${imagePath}`;
}

function flagsFor(row: ProductRow): Product["flags"] {
  const flags: Product["flags"] = [];
  if (row.featured) flags.push("featured");
  if (row.is_new) flags.push("new");
  if (row.is_deal) flags.push("deal");
  if (row.stock > 0 && row.stock <= row.low_stock_threshold) flags.push("limited");
  return flags.length > 0 ? flags : ["featured"];
}

function normalizeRow(env: Env, row: ProductRow): Product {
  const details = JSON.parse(row.details_json) as ProductDetails;
  const finalPrice = row.final_price_cents;
  const price = row.compare_at_price_cents ?? finalPrice;
  const discountPercentage = row.compare_at_price_cents
    ? Math.max(0, Math.min(95, Math.round((1 - finalPrice / row.compare_at_price_cents) * 100)))
    : 0;

  const categoryName = humanizeCategorySlug(row.category);
  const availableStock = Math.max(0, row.stock);
  const availabilityStatus = getInventoryStatus(availableStock, row.low_stock_threshold);

  const images: Product["images"] = [details.images.main, ...details.images.gallery].map((imagePath, index) => ({
    url: absoluteImageUrl(env, imagePath),
    alt: `${row.name} image ${index + 1}`,
    source: /^https?:\/\//i.test(imagePath) ? "cloudinary" : "local"
  }));

  const flags = flagsFor(row);
  const specifications = Object.entries(details.specs).map(([key, value]) => ({ key, value }));
  const primaryVariant = details.variants[0];

  return productSchema.parse({
    id: row.id,
    externalId: null,
    sourceId: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: details.shortDescription,
    description: details.description,
    price,
    originalPrice: row.compare_at_price_cents ? price : null,
    finalPrice,
    discountPercentage,
    currency: "USD",
    category: {
      id: row.category,
      externalId: null,
      slug: row.category,
      name: categoryName,
      image: images[0]?.url ?? null
    },
    sku: row.sku,
    brand: row.brand,
    tags: [row.category, row.subcategory, ...details.tags, ...flags].filter((tag): tag is string => Boolean(tag)),
    initialStock: availableStock,
    reservedStock: 0,
    soldStock: 0,
    returnedStock: 0,
    adjustedStock: 0,
    availableStock,
    availabilityStatus: availabilityStatus === "hidden" ? "discontinued" : availabilityStatus,
    thumbnail: images[0]?.url ?? absoluteImageUrl(env, details.images.main),
    images,
    gallery: images.map((image) => image.url),
    specifications,
    flags,
    seo: {
      title: details.seoTitle || `${row.name} | Aether`,
      description: details.seoDescription || details.shortDescription.slice(0, 150),
      canonicalPath: `/products/${row.slug}`
    },
    variants: primaryVariant
      ? primaryVariant.options.map((option, index) => ({
          id: `${row.slug}-${option.toLowerCase().replace(/\s+/g, "-")}`,
          name: primaryVariant.type,
          value: option,
          priceAdjustment: 0,
          stockAdjustment: 0,
          label: option,
          sku: `${row.sku}-${index + 1}`,
          priceDelta: 0,
          inventory: availableStock,
          attributes: { [primaryVariant.type]: option }
        }))
      : [],
    rating: {
      average: row.rating_average,
      count: row.rating_count
    },
    reviewCount: row.rating_count,
    reviews: [],
    inventory: {
      sku: row.sku,
      available: availableStock,
      reserved: 0,
      lowStockThreshold: row.low_stock_threshold,
      status: getInventoryStatus(availableStock, row.low_stock_threshold)
    },
    visibility: row.visibility,
    featured: flags.includes("featured"),
    newArrival: flags.includes("new"),
    deal: flags.includes("deal"),
    visible: row.visibility === "visible",
    seoTitle: details.seoTitle || `${row.name} | Aether`,
    seoDescription: details.seoDescription || details.shortDescription.slice(0, 150),
    catalogSource: "local",
    externalStock: null,
    lastSyncedAt: row.updated_at,
    shippingInformation: null,
    warrantyInformation: null,
    returnPolicy: null,
    minimumOrderQuantity: null,
    weight: null,
    dimensions: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function readAllRows(env: Env): Promise<ProductRow[]> {
  const rows = await env.DB.prepare("select * from products order by updated_at desc").all<ProductRow>();
  return rows.results || [];
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

// Cached set includes every row regardless of visibility - getCatalogSource
// filters to "visible" for the public-facing functions below, while
// products-admin.ts reads the table directly (bypassing this cache
// entirely) so admin management always sees drafts/hidden products and
// never a stale cached view of its own just-made edit.
async function getCatalogSource(env: Env): Promise<Product[]> {
  const cached = await readCachedProducts(env);
  const all = cached ?? (await (async () => {
    const rows = await readAllRows(env);
    const products = rows.map((row) => normalizeRow(env, row));
    await writeCachedProducts(env, products);
    return products;
  })());
  return all.filter((product) => product.visibility === "visible");
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
  normalizeRow,
  flagsFor,
  foldText,
  readAllRows
};
