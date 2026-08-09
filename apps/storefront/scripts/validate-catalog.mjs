// Fails with a clear message if data/products.json breaks any of the rules
// from the catalog generation prompt: minimum count, duplicate ids/skus/slugs,
// unknown categories, missing schema fields, or invalid pricing.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "..", "data", "products.json");

const ALLOWED_CATEGORIES = [
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
];

const REQUIRED_FIELDS = [
  "id",
  "sku",
  "slug",
  "name",
  "brand",
  "category",
  "subcategory",
  "price",
  "currency",
  "stock",
  "rating",
  "reviewCount",
  "shortDescription",
  "description",
  "highlights",
  "specs",
  "tags",
  "variants",
  "images",
  "imagePrompt",
  "featured",
  "isNew",
  "createdAt"
];

const errors = [];

let products;
try {
  products = JSON.parse(readFileSync(dataPath, "utf8"));
} catch (err) {
  console.error(`Could not read/parse ${dataPath}: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(products)) {
  errors.push("data/products.json must be a JSON array.");
} else {
  if (products.length < 200) {
    errors.push(`Expected at least 200 products, found ${products.length}.`);
  }

  const seenIds = new Map();
  const seenSkus = new Map();
  const seenSlugs = new Map();

  products.forEach((p, index) => {
    const where = `product[${index}] (id=${p?.id ?? "?"})`;

    for (const field of REQUIRED_FIELDS) {
      if (p[field] === undefined || p[field] === null || p[field] === "") {
        errors.push(`${where}: missing required field "${field}".`);
      }
    }

    if (p.id) {
      if (seenIds.has(p.id)) errors.push(`Duplicate id "${p.id}" (${where} and product[${seenIds.get(p.id)}]).`);
      else seenIds.set(p.id, index);
    }
    if (p.sku) {
      if (seenSkus.has(p.sku)) errors.push(`Duplicate sku "${p.sku}" (${where} and product[${seenSkus.get(p.sku)}]).`);
      else seenSkus.set(p.sku, index);
    }
    if (p.slug) {
      if (seenSlugs.has(p.slug)) errors.push(`Duplicate slug "${p.slug}" (${where} and product[${seenSlugs.get(p.slug)}]).`);
      else seenSlugs.set(p.slug, index);
    }

    if (p.category && !ALLOWED_CATEGORIES.includes(p.category)) {
      errors.push(`${where}: category "${p.category}" is not in the allowed list.`);
    }

    if (typeof p.price === "number" && p.price <= 0) {
      errors.push(`${where}: price must be > 0, got ${p.price}.`);
    }

    if (p.compareAtPrice !== undefined && p.compareAtPrice !== null) {
      if (typeof p.compareAtPrice !== "number" || p.compareAtPrice <= p.price) {
        errors.push(`${where}: compareAtPrice (${p.compareAtPrice}) must be > price (${p.price}).`);
      }
    }

    if (Array.isArray(p.images?.gallery)) {
      const totalImages = 1 + p.images.gallery.length;
      if (totalImages < 2 || totalImages > 4) {
        errors.push(`${where}: expected 2-4 images total, found ${totalImages}.`);
      }
    } else {
      errors.push(`${where}: images.gallery must be an array.`);
    }
  });

  const byCategory = {};
  for (const p of products) {
    if (!p.category) continue;
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
  }
  for (const cat of ALLOWED_CATEGORIES) {
    const count = byCategory[cat] ?? 0;
    if (count === 0) errors.push(`Category "${cat}" has zero products.`);
  }
}

if (errors.length > 0) {
  console.error(`Catalog validation FAILED with ${errors.length} error(s):\n`);
  for (const e of errors.slice(0, 50)) console.error(` - ${e}`);
  if (errors.length > 50) console.error(`   ...and ${errors.length - 50} more.`);
  process.exit(1);
}

console.log(`Catalog validation passed: ${products.length} products, ${ALLOWED_CATEGORIES.length} categories all populated.`);
