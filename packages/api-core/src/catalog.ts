import type { Product, ProductQuery } from "@aether/schemas";

/** Normalizes text for catalog search without assuming a store language. */
export function foldCatalogText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type CatalogPage = {
  data: Product[];
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
};

/** Applies the public query contract to an already-authorized catalog source. */
export function queryCatalog(products: readonly Product[], query: ProductQuery): CatalogPage {
  let filtered = [...products];
  const search = query.search ?? query.q;
  if (search) {
    const needle = foldCatalogText(search);
    filtered = filtered.filter((product) => {
      const haystack = [product.name, product.brand ?? "", product.shortDescription, ...product.tags].join(" ");
      return foldCatalogText(haystack).includes(needle);
    });
  }
  if (query.category) filtered = filtered.filter((product) => product.category.slug === query.category);
  if (query.brand) {
    const brand = query.brand.toLowerCase();
    filtered = filtered.filter((product) => (product.brand ?? "").toLowerCase() === brand);
  }
  if (query.flag !== undefined) {
    const flag = query.flag;
    filtered = filtered.filter((product) => product.flags.includes(flag));
  }
  if (query.featured) filtered = filtered.filter((product) => product.featured);
  if (query.deal) filtered = filtered.filter((product) => product.deal);
  if (query.newArrival) filtered = filtered.filter((product) => product.newArrival);
  if (query.inStock) filtered = filtered.filter((product) => product.availableStock > 0);
  if (query.hasDiscount) filtered = filtered.filter((product) => product.discountPercentage > 0);
  if (query.minPrice !== undefined) filtered = filtered.filter((product) => product.finalPrice >= query.minPrice!);
  if (query.maxPrice !== undefined) filtered = filtered.filter((product) => product.finalPrice <= query.maxPrice!);
  if (query.minRating !== undefined) filtered = filtered.filter((product) => product.rating.average >= query.minRating!);

  filtered.sort((a, b) => {
    if (query.sort === "price_asc") return a.finalPrice - b.finalPrice;
    if (query.sort === "price_desc") return b.finalPrice - a.finalPrice;
    if (query.sort === "rating") return b.rating.average - a.rating.average;
    if (query.sort === "name") return a.name.localeCompare(b.name);
    if (query.sort === "discount") return b.discountPercentage - a.discountPercentage;
    if (query.sort === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return Number(b.flags.includes("featured")) - Number(a.flags.includes("featured"));
  });

  const total = filtered.length;
  const pageSize = query.limit ?? query.pageSize;
  const start = (query.page - 1) * pageSize;
  return {
    data: filtered.slice(start, start + pageSize),
    pagination: { page: query.page, pageSize, total, pageCount: Math.ceil(total / pageSize) }
  };
}

export type ProductOverrideInput = {
  name?: string | undefined;
  visibility?: "visible" | "hidden" | "draft" | undefined;
  flags?: Array<"featured" | "new" | "deal" | "limited" | "hidden"> | undefined;
};

export interface ProductOverrideRepository {
  insert(input: { id: string; productId: string; override: ProductOverrideInput }): Promise<void>;
  upsert(input: { id: string; productId: string; override: ProductOverrideInput }): Promise<void>;
  remove(productId: string): Promise<void>;
}

/** Reusable lifecycle for store-specific catalog overrides. */
export class ProductOverrideService {
  constructor(
    private readonly repository: ProductOverrideRepository,
    private readonly createId: () => string
  ) {}

  async create(productId: string, override: ProductOverrideInput): Promise<{ id: string; productId: string }> {
    const id = this.createId();
    await this.repository.insert({ id, productId, override });
    return { id, productId };
  }

  async save(productId: string, override: ProductOverrideInput): Promise<{ id: string; productId: string; saved: true }> {
    const id = `override_${productId}`;
    await this.repository.upsert({ id, productId, override });
    return { id, productId, saved: true };
  }

  async restore(productId: string): Promise<{ productId: string; restored: true }> {
    await this.repository.remove(productId);
    return { productId, restored: true };
  }
}
