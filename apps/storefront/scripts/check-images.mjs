// Verifies every image path referenced in data/products.json exists on disk,
// and reports any file in public/products/ that no product references
// (orphaned from a renamed/removed slug).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataPath = path.join(root, "data", "products.json");
const publicDir = path.join(root, "public", "products");

const products = JSON.parse(readFileSync(dataPath, "utf8"));

const referenced = new Set();
const missing = [];

for (const product of products) {
  const paths = [product.images?.main, ...(product.images?.gallery ?? [])].filter(Boolean);
  for (const p of paths) {
    const rel = p.replace(/^\/products\//, "");
    referenced.add(rel);
    referenced.add(rel.replace(/\.webp$/, "-thumb.webp"));
    const full = path.join(publicDir, rel);
    if (!existsSync(full)) missing.push({ slug: product.slug, path: p });
  }
}

const onDisk = existsSync(publicDir) ? readdirSync(publicDir) : [];
const orphaned = onDisk.filter((file) => !referenced.has(file));

if (missing.length > 0) {
  console.error(`Missing ${missing.length} image file(s):`);
  for (const m of missing.slice(0, 50)) console.error(` - ${m.slug}: ${m.path}`);
  if (missing.length > 50) console.error(`   ...and ${missing.length - 50} more.`);
}

if (orphaned.length > 0) {
  console.warn(`\n${orphaned.length} orphaned file(s) in public/products/ (not referenced by any product):`);
  for (const o of orphaned.slice(0, 50)) console.warn(` - ${o}`);
  if (orphaned.length > 50) console.warn(`   ...and ${orphaned.length - 50} more.`);
}

if (missing.length === 0 && orphaned.length === 0) {
  console.log(`All good: ${referenced.size} expected files, all present, none orphaned.`);
}

process.exit(missing.length > 0 ? 1 : 0);
