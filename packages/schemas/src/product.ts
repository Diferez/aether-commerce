import { z } from "zod";

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 code");

export const productVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  value: z.string().min(1),
  priceAdjustment: z.number().int(),
  stockAdjustment: z.number().int(),
  label: z.string().min(1),
  sku: z.string().min(1),
  priceDelta: z.number().int(),
  inventory: z.number().int().min(0),
  attributes: z.record(z.string(), z.string())
});

export const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  source: z.enum(["dummyjson", "cloudinary", "fallback", "local"])
});

export const productRatingSchema = z.object({
  average: z.number().min(0).max(5),
  count: z.number().int().min(0)
});

export const productReviewSchema = z.object({
  rating: z.number().min(0).max(5),
  comment: z.string().min(1),
  date: z.string().datetime(),
  reviewerName: z.string().min(1)
});

export const productDimensionsSchema = z.object({
  width: z.number().min(0),
  height: z.number().min(0),
  depth: z.number().min(0)
});

export const productSchema = z.object({
  id: z.string().min(1),
  externalId: z.number().int().nullable(),
  sourceId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  shortDescription: z.string().min(1),
  description: z.string().min(1),
  price: z.number().int().min(0),
  originalPrice: z.number().int().min(0).nullable(),
  finalPrice: z.number().int().min(0),
  discountPercentage: z.number().int().min(0).max(95),
  currency: currencySchema,
  category: z.object({
    id: z.string().min(1),
    externalId: z.number().int().nullable(),
    slug: z.string().min(1),
    name: z.string().min(1),
    image: z.string().url().nullable()
  }),
  sku: z.string().min(1),
  brand: z.string().nullable(),
  tags: z.array(z.string()),
  initialStock: z.number().int().min(0),
  reservedStock: z.number().int().min(0),
  soldStock: z.number().int().min(0),
  returnedStock: z.number().int().min(0),
  adjustedStock: z.number().int(),
  availableStock: z.number().int().min(0),
  availabilityStatus: z.enum(["in_stock", "low_stock", "out_of_stock", "discontinued"]),
  thumbnail: z.string().url(),
  images: z.array(productImageSchema).min(1),
  gallery: z.array(z.string().url()),
  specifications: z.array(z.object({ key: z.string().min(1), value: z.string().min(1) })),
  flags: z.array(z.enum(["featured", "new", "deal", "limited", "hidden"])),
  seo: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    canonicalPath: z.string().min(1)
  }),
  variants: z.array(productVariantSchema),
  rating: productRatingSchema,
  reviewCount: z.number().int().min(0),
  reviews: z.array(productReviewSchema),
  inventory: z.object({
    sku: z.string().min(1),
    available: z.number().int().min(0),
    reserved: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0),
    status: z.enum(["in_stock", "low_stock", "out_of_stock", "hidden", "discontinued"])
  }),
  visibility: z.enum(["visible", "hidden", "draft"]),
  featured: z.boolean(),
  newArrival: z.boolean(),
  deal: z.boolean(),
  visible: z.boolean(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  catalogSource: z.enum(["dummyjson", "local"]),
  externalStock: z.number().int().min(0).nullable(),
  lastSyncedAt: z.string().datetime(),
  shippingInformation: z.string().nullable(),
  warrantyInformation: z.string().nullable(),
  returnPolicy: z.string().nullable(),
  minimumOrderQuantity: z.number().int().min(1).nullable(),
  weight: z.number().min(0).nullable(),
  dimensions: productDimensionsSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const productQuerySchema = z.object({
  q: z.string().trim().optional(),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  flag: z.enum(["featured", "new", "deal", "limited"]).optional(),
  featured: z.coerce.boolean().optional(),
  deal: z.coerce.boolean().optional(),
  newArrival: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
  hasDiscount: z.coerce.boolean().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  minRating: z.coerce.number().min(0).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(12),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  sort: z
    .enum(["featured", "newest", "price_asc", "price_desc", "rating", "name", "discount"])
    .default("featured")
});

export type Product = z.infer<typeof productSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
