import type { Env } from "../types";
import { clearCatalogCache, type ProductDetails, type ProductRow } from "./catalog";

export type AdminProductSummary = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  finalPriceCents: number;
  stock: number;
  lowStockThreshold: number;
  visibility: ProductRow["visibility"];
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminProductListQuery = {
  search?: string | undefined;
  visibility?: ProductRow["visibility"] | undefined;
  category?: string | undefined;
  stockFilter?: "low" | "out" | undefined;
  page: number;
  pageSize: number;
  sort?: "name" | "price" | "stock" | "updated_at" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
};

function firstImage(row: ProductRow): string | null {
  try {
    const details = JSON.parse(row.details_json) as ProductDetails;
    return details.images?.main ?? null;
  } catch {
    return null;
  }
}

function rowToSummary(row: ProductRow): AdminProductSummary {
  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    priceCents: row.price_cents,
    compareAtPriceCents: row.compare_at_price_cents,
    finalPriceCents: row.final_price_cents,
    stock: row.stock,
    lowStockThreshold: row.low_stock_threshold,
    visibility: row.visibility,
    thumbnail: firstImage(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Reads apps/api/src/data/products.json (200 hits) sit fine in memory client
// side, but this admin list is meant to grow with real store inventory, so
// filtering/sorting/pagination happen in SQL rather than loading every row -
// unlike the public catalog.ts read path, which still caches the full
// visible set in memory/D1 for storefront browsing.
export async function listProductsForAdmin(env: Env, query: AdminProductListQuery) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.search) {
    where.push("(name like ? or sku like ? or slug like ?)");
    const needle = `%${query.search}%`;
    params.push(needle, needle, needle);
  }
  if (query.visibility) {
    where.push("visibility = ?");
    params.push(query.visibility);
  }
  if (query.category) {
    where.push("category = ?");
    params.push(query.category);
  }
  if (query.stockFilter === "out") {
    where.push("stock <= 0");
  } else if (query.stockFilter === "low") {
    where.push("stock > 0 and stock <= low_stock_threshold");
  }

  const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";
  const sortColumn = { name: "name", price: "final_price_cents", stock: "stock", updated_at: "updated_at" }[
    query.sort ?? "updated_at"
  ];
  const sortDirection = query.sortDirection === "asc" ? "asc" : "desc";

  const total = await env.DB.prepare(`select count(*) as count from products ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const offset = (query.page - 1) * query.pageSize;
  const rows = await env.DB.prepare(
    `select * from products ${whereClause} order by ${sortColumn} ${sortDirection} limit ? offset ?`
  )
    .bind(...params, query.pageSize, offset)
    .all<ProductRow>();

  const totalCount = total?.count ?? 0;
  return {
    data: (rows.results || []).map(rowToSummary),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: totalCount,
      pageCount: Math.max(1, Math.ceil(totalCount / query.pageSize))
    }
  };
}

export async function getProductRow(env: Env, id: string): Promise<ProductRow | null> {
  const row = await env.DB.prepare("select * from products where id = ?").bind(id).first<ProductRow>();
  return row ?? null;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function uniqueSlug(env: Env, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "producto";
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const existing = await env.DB.prepare("select id from products where slug = ?").bind(candidate).first<{
      id: string;
    }>();
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

async function uniqueSku(env: Env, category: string): Promise<string> {
  const prefix = (slugify(category).slice(0, 3) || "gen").toUpperCase();
  for (;;) {
    const candidate = `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const existing = await env.DB.prepare("select id from products where sku = ?").bind(candidate).first<{
      id: string;
    }>();
    if (!existing) return candidate;
  }
}

export type ProductWriteInput = {
  name: string;
  slug?: string | undefined;
  sku?: string | undefined;
  brand?: string | null | undefined;
  category: string;
  subcategory?: string | null | undefined;
  shortDescription: string;
  description: string;
  highlights?: string[] | undefined;
  specs?: Record<string, string> | undefined;
  tags?: string[] | undefined;
  variants?: Array<{ type: string; options: string[] }> | undefined;
  images: { main: string; gallery: string[] };
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
  priceCents: number;
  compareAtPriceCents?: number | null | undefined;
  stock: number;
  lowStockThreshold?: number | undefined;
  visibility?: ProductRow["visibility"] | undefined;
  featured?: boolean | undefined;
  isNew?: boolean | undefined;
  isDeal?: boolean | undefined;
};

function detailsFromInput(input: ProductWriteInput): ProductDetails {
  return {
    shortDescription: input.shortDescription,
    description: input.description,
    highlights: input.highlights ?? [],
    specs: input.specs ?? {},
    tags: input.tags ?? [],
    variants: input.variants ?? [],
    images: input.images,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription
  };
}

export async function createProduct(env: Env, input: ProductWriteInput): Promise<ProductRow> {
  const id = `prd_${crypto.randomUUID()}`;
  const slug = await uniqueSlug(env, input.slug || input.name);
  const sku = input.sku || (await uniqueSku(env, input.category));
  const finalPriceCents = input.priceCents;
  const compareAtPriceCents = input.compareAtPriceCents ?? null;
  // SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" (space
  // separator, no T/Z) - not valid ISO 8601, which productSchema's
  // z.string().datetime() requires. Writing an explicit ISO string here
  // (same as the seed migration does) avoids a 500 the next time this row
  // is read back through normalizeRow.
  const now = new Date().toISOString();

  await env.DB.prepare(
    `insert into products
       (id, sku, slug, name, brand, category, subcategory, price_cents, compare_at_price_cents, final_price_cents, stock, low_stock_threshold, visibility, featured, is_new, is_deal, rating_average, rating_count, details_json, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`
  )
    .bind(
      id,
      sku,
      slug,
      input.name,
      input.brand ?? null,
      input.category,
      input.subcategory ?? null,
      compareAtPriceCents ?? finalPriceCents,
      compareAtPriceCents,
      finalPriceCents,
      input.stock,
      input.lowStockThreshold ?? 4,
      input.visibility ?? "draft",
      input.featured ? 1 : 0,
      input.isNew ? 1 : 0,
      input.isDeal ? 1 : 0,
      JSON.stringify(detailsFromInput(input)),
      now,
      now
    )
    .run();

  await clearCatalogCache(env);
  return (await getProductRow(env, id)) as ProductRow;
}

// Partial<ProductWriteInput> alone isn't enough under exactOptionalPropertyTypes:
// it makes originally-required fields (name, category, ...) `field?: string`
// (no `| undefined`), but the zod .partial() schema that actually produces
// these values infers every field as `T | undefined`. This mapped type adds
// that explicitly for every key instead of hand-duplicating the whole shape.
export type ProductPatchInput = { [K in keyof ProductWriteInput]?: ProductWriteInput[K] | undefined };

export async function updateProduct(env: Env, id: string, patch: ProductPatchInput): Promise<ProductRow | null> {
  const existing = await getProductRow(env, id);
  if (!existing) return null;

  const existingDetails = JSON.parse(existing.details_json) as ProductDetails;
  const mergedDetails: ProductDetails = {
    shortDescription: patch.shortDescription ?? existingDetails.shortDescription,
    description: patch.description ?? existingDetails.description,
    highlights: patch.highlights ?? existingDetails.highlights,
    specs: patch.specs ?? existingDetails.specs,
    tags: patch.tags ?? existingDetails.tags,
    variants: patch.variants ?? existingDetails.variants,
    images: patch.images ?? existingDetails.images,
    seoTitle: patch.seoTitle ?? existingDetails.seoTitle,
    seoDescription: patch.seoDescription ?? existingDetails.seoDescription
  };

  const slug = patch.slug !== undefined ? await uniqueSlug(env, patch.slug, id) : existing.slug;
  const finalPriceCents = patch.priceCents ?? existing.final_price_cents;
  const compareAtPriceCents =
    patch.compareAtPriceCents !== undefined ? patch.compareAtPriceCents : existing.compare_at_price_cents;

  await env.DB.prepare(
    `update products set
       sku = ?, slug = ?, name = ?, brand = ?, category = ?, subcategory = ?,
       price_cents = ?, compare_at_price_cents = ?, final_price_cents = ?,
       stock = ?, low_stock_threshold = ?, visibility = ?, featured = ?, is_new = ?, is_deal = ?,
       details_json = ?, updated_at = ?
     where id = ?`
  )
    .bind(
      patch.sku ?? existing.sku,
      slug,
      patch.name ?? existing.name,
      patch.brand !== undefined ? patch.brand : existing.brand,
      patch.category ?? existing.category,
      patch.subcategory !== undefined ? patch.subcategory : existing.subcategory,
      compareAtPriceCents ?? finalPriceCents,
      compareAtPriceCents,
      finalPriceCents,
      patch.stock ?? existing.stock,
      patch.lowStockThreshold ?? existing.low_stock_threshold,
      patch.visibility ?? existing.visibility,
      patch.featured !== undefined ? (patch.featured ? 1 : 0) : existing.featured,
      patch.isNew !== undefined ? (patch.isNew ? 1 : 0) : existing.is_new,
      patch.isDeal !== undefined ? (patch.isDeal ? 1 : 0) : existing.is_deal,
      JSON.stringify(mergedDetails),
      new Date().toISOString(),
      id
    )
    .run();

  await clearCatalogCache(env);
  return getProductRow(env, id);
}

export async function setProductVisibility(
  env: Env,
  id: string,
  visibility: ProductRow["visibility"]
): Promise<boolean> {
  const result = await env.DB.prepare("update products set visibility = ?, updated_at = ? where id = ?")
    .bind(visibility, new Date().toISOString(), id)
    .run();
  await clearCatalogCache(env);
  return (result.meta.changes ?? 0) > 0;
}

export async function bulkSetVisibility(
  env: Env,
  ids: string[],
  visibility: ProductRow["visibility"]
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `update products set visibility = ?, updated_at = ? where id in (${placeholders})`
  )
    .bind(visibility, new Date().toISOString(), ...ids)
    .run();
  await clearCatalogCache(env);
  return result.meta.changes ?? 0;
}

export type BulkPriceAdjustment = { category: string; percent: number };

export type BulkPriceAdjustmentPreviewRow = { id: string; name: string; sku: string; priceCents: number; nextPriceCents: number };

// Read-only preview for the chat's prepare_bulk_product_update tool - same
// selection/rounding rule bulkAdjustPriceByCategory uses to execute, so the
// diff shown for confirmation always matches what actually runs.
export async function previewBulkPriceAdjustment(
  env: Env,
  input: BulkPriceAdjustment
): Promise<BulkPriceAdjustmentPreviewRow[]> {
  const rows = await env.DB.prepare(
    "select id, name, sku, final_price_cents from products where category = ?"
  )
    .bind(input.category)
    .all<{ id: string; name: string; sku: string; final_price_cents: number }>();

  return (rows.results || []).map((row) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    priceCents: row.final_price_cents,
    nextPriceCents: Math.max(0, Math.round(row.final_price_cents * (1 + input.percent / 100)))
  }));
}

// Every other price field (price_cents, compare_at_price_cents) scales by
// the same factor as final_price_cents so a struck-through "was" price
// keeps showing a coherent discount afterward, rather than drifting apart
// from the price it's compared against.
export async function bulkAdjustPriceByCategory(env: Env, input: BulkPriceAdjustment): Promise<number> {
  const factor = 1 + input.percent / 100;
  const result = await env.DB.prepare(
    `update products set
       price_cents = max(0, round(price_cents * ?)),
       compare_at_price_cents = case when compare_at_price_cents is null then null else max(0, round(compare_at_price_cents * ?)) end,
       final_price_cents = max(0, round(final_price_cents * ?)),
       updated_at = ?
     where category = ?`
  )
    .bind(factor, factor, factor, new Date().toISOString(), input.category)
    .run();
  await clearCatalogCache(env);
  return result.meta.changes ?? 0;
}

// Never physically deletes a product that appears in order history - order
// detail pages read order_items.payload_json, which snapshots product data
// at purchase time, but the product listing/lookup by id would otherwise
// break for any admin view that cross-references it. Archiving (visibility
// = 'hidden') keeps the row around without exposing it to shoppers.
export async function deleteProduct(env: Env, id: string): Promise<{ deleted: boolean; softDeleted: boolean }> {
  const referenced = await env.DB.prepare("select count(*) as count from order_items where product_id = ?")
    .bind(id)
    .first<{ count: number }>();

  if ((referenced?.count ?? 0) > 0) {
    await env.DB.prepare("update products set visibility = 'hidden', updated_at = ? where id = ?")
      .bind(new Date().toISOString(), id)
      .run();
    await clearCatalogCache(env);
    return { deleted: false, softDeleted: true };
  }

  const result = await env.DB.prepare("delete from products where id = ?").bind(id).run();
  await clearCatalogCache(env);
  return { deleted: (result.meta.changes ?? 0) > 0, softDeleted: false };
}

export async function adjustProductInventory(
  env: Env,
  id: string,
  input: { delta: number; reason?: string | undefined; actorId: string; requestId: string }
): Promise<{ stock: number } | null> {
  const existing = await getProductRow(env, id);
  if (!existing) return null;

  const nextStock = Math.max(0, existing.stock + input.delta);
  const actualDelta = nextStock - existing.stock;
  if (actualDelta === 0) return { stock: existing.stock };

  await env.DB.batch([
    env.DB.prepare("update products set stock = ?, updated_at = ? where id = ?").bind(
      nextStock,
      new Date().toISOString(),
      id
    ),
    env.DB.prepare(
      "insert into inventory_movements (id, product_id, sku, type, quantity, reason, actor_id, request_id) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      crypto.randomUUID(),
      id,
      existing.sku,
      actualDelta >= 0 ? "adjustment_positive" : "adjustment_negative",
      Math.abs(actualDelta),
      input.reason ?? null,
      input.actorId,
      input.requestId
    ),
    env.DB.prepare(
      `insert into audit_logs (id, actor_id, action, target_type, target_id, payload_json)
       values (?, ?, 'inventory.adjusted', 'product', ?, ?)`
    ).bind(
      crypto.randomUUID(),
      input.actorId,
      id,
      JSON.stringify({ delta: actualDelta, reason: input.reason ?? null, nextStock })
    )
  ]);

  await clearCatalogCache(env);
  return { stock: nextStock };
}
