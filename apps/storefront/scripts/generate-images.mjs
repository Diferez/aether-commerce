// Fetches product photos from the Pexels API (free, requires an API key -
// see the README note this script prints if PEXELS_API_KEY is missing),
// using each product's `tags` as the search query, then normalizes them to
// the exact paths already referenced in data/products.json:
//   public/products/{slug}-{n}.webp        (1000x1000, quality 82)
//   public/products/{slug}-{n}-thumb.webp  (400x400)
//
// Usage:
//   node scripts/generate-images.mjs [--only=category] [--limit=N] [--force]
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataPath = path.join(root, "data", "products.json");
const publicDir = path.join(root, "public", "products");
const logsDir = path.join(root, "logs");

// --- .env loading (no dependency - this project already keeps secrets out of
// the client bundle by convention; read a plain KEY=VALUE file if present) ---
function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (!PEXELS_API_KEY) {
  console.error(
    [
      "PEXELS_API_KEY is not set.",
      "",
      "Get a free key (instant, no cost) at https://www.pexels.com/api/ and add it to",
      `${path.relative(root, path.join(root, ".env"))} or .env.local as:`,
      "  PEXELS_API_KEY=your_key_here",
      "",
      "Then re-run: node scripts/generate-images.mjs"
    ].join("\n")
  );
  process.exit(1);
}

// --- CLI flags ---------------------------------------------------------
const args = process.argv.slice(2);
const onlyCategory = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? Infinity);
const force = args.includes("--force");
const slugsFile = args.find((a) => a.startsWith("--slugs-file="))?.split("=")[1];

// --- Load and select products ------------------------------------------
const allProducts = JSON.parse(readFileSync(dataPath, "utf8"));
let products = onlyCategory ? allProducts.filter((p) => p.category === onlyCategory) : allProducts;
if (slugsFile) {
  const wantedSlugs = new Set(
    readFileSync(slugsFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
  );
  products = products.filter((p) => wantedSlugs.has(p.slug));
}
if (Number.isFinite(limit)) products = products.slice(0, limit);

mkdirSync(publicDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

const CONCURRENCY = 3;
const MAX_RETRIES = 4;
const MAX_RATE_LIMIT_WAIT_MS = 65 * 60 * 1000; // Pexels' free tier resets hourly

async function fetchWithRetry(url, options, attempt = 1) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    // Pexels' free tier is 200 requests/hour - a short backoff won't clear
    // this like a transient 5xx would, so wait for the header's reset time
    // instead of giving up after a few seconds.
    const resetHeader = response.headers.get("x-ratelimit-reset");
    const resetAt = resetHeader ? Number(resetHeader) * 1000 : null;
    const wait = resetAt ? Math.max(resetAt - Date.now(), 1000) : 60000;
    if (wait > MAX_RATE_LIMIT_WAIT_MS) return response;
    console.log(`  (rate limited - waiting ${Math.round(wait / 1000)}s for quota reset)`);
    await new Promise((r) => setTimeout(r, wait));
    return fetchWithRetry(url, options, attempt);
  }

  if (response.status >= 500) {
    if (attempt > MAX_RETRIES) return response;
    const delay = Math.min(2 ** attempt * 500, 8000);
    await new Promise((r) => setTimeout(r, delay));
    return fetchWithRetry(url, options, attempt + 1);
  }

  return response;
}

async function searchPexels(query, page = 1, perPage = 15) {
  // No orientation filter: Pexels' square-cropped results skew toward
  // "flatlay" lifestyle shots (several unrelated items arranged on a desk)
  // rather than clean product photography, which is usually landscape. The
  // download step already center-crops to a 1:1 square, so filtering by
  // orientation here only made the pool worse, not more relevant.
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
  const response = await fetchWithRetry(url, { headers: { Authorization: PEXELS_API_KEY } });
  if (!response.ok) throw new Error(`Pexels search failed (${response.status}) for "${query}"`);
  const payload = await response.json();
  return payload.photos ?? [];
}

// Shared across every product so two products in the same subcategory (same
// search query) don't end up with the exact same photo - reserved
// synchronously before any await, so concurrent workers never race on it.
const usedPhotoIds = new Set();
function reserveDistinctPhoto(candidates) {
  for (const photo of candidates) {
    if (!usedPhotoIds.has(photo.id)) {
      usedPhotoIds.add(photo.id);
      return photo;
    }
  }
  return null;
}

const MAX_IMAGE_BYTES = 150 * 1024;

async function encodeUnderLimit(resized, startQuality) {
  let quality = startQuality;
  let out = await resized.clone().webp({ quality }).toBuffer();
  while (out.length > MAX_IMAGE_BYTES && quality > 40) {
    quality -= 8;
    out = await resized.clone().webp({ quality }).toBuffer();
  }
  return out;
}

async function downloadAndProcess(imageUrl, outMainPath, outThumbPath) {
  const response = await fetchWithRetry(imageUrl, {});
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const main = sharp(buffer).resize(1000, 1000, { fit: "cover", position: "attention" });
  writeFileSync(outMainPath, await encodeUnderLimit(main, 82));

  const thumb = sharp(buffer).resize(400, 400, { fit: "cover", position: "attention" });
  writeFileSync(outThumbPath, await encodeUnderLimit(thumb, 82));
}

// Ordered most-specific-first: each entry is [pattern to test against the
// normalized (lowercase, accent-stripped) product name, Pexels search term].
// A search built from real product-type words ("phone case", "office chair")
// reliably returns the right kind of stock photo; a search built from the
// product's own invented marketing name (its last word is usually a
// model/line qualifier like "Fold", "RTX", "Chrono") does not - Pexels has no
// idea what a "Meridian Willow" or a "Ridgeline Vanguard" is, so that query
// falls back to irrelevant top results.
//
// A few product names contain a furniture/room word inside an unrelated
// product (e.g. "Soporte Plegable de Escritorio" is a stand, not a desk), so
// those ambiguous families are resolved explicitly in queryFor() before this
// list is consulted at all.
const NAME_QUERY_RULES = [
  [/espejo/, "decorative wall mirror"],
  [/cuadro/, "framed wall art print"],
  [/reloj de pared/, "modern wall clock"],
  [/lampara de mesa/, "table lamp"],
  [/lampara de piso/, "floor lamp"],
  [/lampara de escritorio/, "desk lamp"],
  [/lampara colgante/, "pendant hanging lamp"],
  [/set de luces/, "string lights home decor"],
  [/cesta|canasta/, "woven storage basket"],
  [/frasco/, "glass jar set kitchen"],
  [/organizador.*closet/, "closet organizer shelving"],
  [/organizador/, "drawer organizer"],
  [/cojin/, "throw pillow cushion"],
  [/manta|cobertor/, "knit throw blanket"],
  [/tapete/, "area rug"],
  [/cortina/, "blackout curtains"],
  [/silla gamer/, "gaming chair"],
  [/silla/, "office chair"],
  [/escritorio/, "office desk"],
  [/estanteria/, "bookshelf shelving unit"],
  [/sofa/, "modern sofa couch"],

  [/read|paperlight/, "e-reader device"],
  [/tridex|corex/, "tablet computer"],

  [/funda/, "phone case"],
  [/cable/, "usb cable"],
  [/power bank/, "portable power bank charger"],

  [/frecuencia cardiaca/, "heart rate monitor chest strap"],
  [/cuerda de salto/, "jump rope"],
  [/guantes de entrenamiento/, "gym gloves"],
  [/bandas de resistencia/, "resistance bands fitness"],
  [/botella termica/, "insulated water bottle"],
  [/botella plegable/, "collapsible water bottle"],
  [/shaker/, "protein shaker bottle"],
  [/mancuernas/, "adjustable dumbbells"],
  [/rodillo de espuma/, "foam roller"],
  [/colchoneta de yoga/, "yoga mat"],
  [/barra de dominadas/, "pull up bar"],
  [/luz trasera/, "bike tail light"],
  [/casco de ciclismo/, "bike helmet"],

  [/solmark|fendra/, "sunglasses"],

  [/ryzel/, "foldable smartphone"],
  [/ovalta|arion/, "smartphone"]
];

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function queryFor(product) {
  const name = normalize(product.name);

  // Resolved first because their own name contains a word ("escritorio",
  // "auto") that would otherwise match an unrelated rule in the list below.
  if (/soporte/.test(name)) {
    if (/bicicleta|manubrio/.test(name)) return "phone bike mount";
    if (/auto/.test(name)) return "car phone mount";
    if (/videollamada/.test(name)) return "phone stand desk";
    return "phone stand";
  }
  if (/cargador/.test(name)) {
    if (/auto/.test(name)) return "car phone charger";
    if (/inalambrico/.test(name)) return "wireless phone charger";
    return "usb wall charger";
  }
  if (/audifono/.test(name)) {
    return /in-ear/.test(name) ? "earbuds" : "headphones";
  }
  if (/ridgeline|kaelo/.test(name)) {
    if (/2-en-1|swivel/.test(name)) return "2 in 1 convertible laptop";
    if (product.subcategory === "gaming") return "gaming laptop";
    return "laptop computer";
  }
  // Driven by the actual category field, not the brand name - some watch
  // lines (e.g. "Chronoly Meridian Classic") borrow a name that would
  // otherwise misidentify which gender's watch line it belongs to.
  if (product.category === "mens-watches" || product.category === "womens-watches") {
    if (product.subcategory === "smartwatch") return "smartwatch on wrist";
    return product.category === "mens-watches" ? "men's wristwatch" : "women's wristwatch";
  }

  for (const [pattern, query] of NAME_QUERY_RULES) {
    if (pattern.test(name)) return query;
  }

  // Fallback for anything not covered above: the old tag/category heuristic,
  // without the marketing-name word that caused irrelevant results.
  return [product.tags?.[0], product.subcategory, product.category.replace(/-/g, " ")].filter(Boolean).join(" ");
}

async function processProduct(product, index, total) {
  const slotsNeeded = 1 + (product.images?.gallery?.length ?? 0);
  const results = { slug: product.slug, generated: 0, skipped: 0, failed: 0, error: null };

  try {
    const slotsMissing = [];
    for (let slot = 0; slot < slotsNeeded; slot += 1) {
      const mainPath = path.join(publicDir, `${product.slug}-${slot + 1}.webp`);
      const thumbPath = path.join(publicDir, `${product.slug}-${slot + 1}-thumb.webp`);
      if (!force && existsSync(mainPath) && existsSync(thumbPath)) {
        results.skipped += 1;
      } else {
        slotsMissing.push({ slot, mainPath, thumbPath });
      }
    }

    if (slotsMissing.length > 0) {
      // One search covers every missing slot for this product - keeps total
      // API calls close to one per product instead of one per image.
      const query = queryFor(product);
      let candidates = await searchPexels(query, 1, Math.max(15, slotsMissing.length + 5));
      if (candidates.length < slotsMissing.length) {
        candidates = candidates.concat(await searchPexels(query, 2));
      }

      for (const { mainPath, thumbPath } of slotsMissing) {
        let photo = reserveDistinctPhoto(candidates);
        if (!photo) photo = candidates[results.generated % candidates.length] ?? null;
        if (!photo) throw new Error(`No Pexels results for "${query}"`);

        const imageUrl = photo.src?.large ?? photo.src?.medium ?? photo.src?.original;
        await downloadAndProcess(imageUrl, mainPath, thumbPath);
        results.generated += 1;
      }
    }
    console.log(`[${index + 1}/${total}] ${product.slug} ✓ (${results.generated} new, ${results.skipped} skipped)`);
  } catch (err) {
    results.failed = slotsNeeded - results.generated - results.skipped;
    results.error = err.message;
    console.log(`[${index + 1}/${total}] ${product.slug} ✗ ${err.message}`);
  }
  return results;
}

async function runPool(items, worker, concurrency) {
  const results = [];
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await worker(items[i], i, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

const results = await runPool(products, processProduct, CONCURRENCY);

const generated = results.reduce((sum, r) => sum + r.generated, 0);
const skipped = results.reduce((sum, r) => sum + r.skipped, 0);
const failed = results.filter((r) => r.error);

console.log("\n--- Summary ---");
console.log(`Generated: ${generated}`);
console.log(`Skipped (already existed): ${skipped}`);
console.log(`Failed products: ${failed.length}`);

if (failed.length > 0) {
  const failLog = path.join(logsDir, "failed-images.txt");
  writeFileSync(failLog, failed.map((r) => `${r.slug}: ${r.error}`).join("\n") + "\n", "utf8");
  console.log(`Failed slugs written to ${path.relative(root, failLog)}`);
}
