import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const specPath = resolve("docs/openapi/aether.v1.yaml");
const spec = readFileSync(specPath, "utf8");

const requiredPaths = [
  "/products:",
  "/products/{id}:",
  "/products/slug/{slug}:",
  "/categories:",
  "/categories/{slug}/products:",
  "/search:",
  "/featured-products:",
  "/deals:",
  "/new-arrivals:",
  "/catalog/products:",
  "/cart/{id}/items:",
  "/cart/items:",
  "/checkout/session:",
  "/contact:",
  "/admin/dashboard:",
  "/admin/products:",
  "/admin/orders:",
  "/admin/demo/summary:",
  "/webhooks/stripe:"
];

const missing = requiredPaths.filter((path) => !spec.includes(path));

if (missing.length > 0) {
  console.error(`OpenAPI spec is missing: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("OpenAPI spec contains required Aether v1 routes.");
