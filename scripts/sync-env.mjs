import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, ".env");

const workerKeys = [
  "APP_ORIGIN_STORE",
  "APP_ORIGIN_ADMIN",
  "APP_STORE_BASE_PATH",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "CLERK_JWT_ISSUER",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "WOMPI_SECRET_KEY",
  "WOMPI_EVENTS_SECRET",
  "RESEND_API_KEY",
  "CONTACT_RECIPIENT_EMAIL",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_UPLOAD_PRESET",
  "CLOUDINARY_CLOUD_NAME",
  "DUMMYJSON_API_BASE_URL",
  "AETHER_SETTINGS_ENCRYPTION_KEY",
  "AETHER_ENV"
];

const publicKeys = [
  "NEXT_PUBLIC_AETHER_API_URL",
  "NEXT_PUBLIC_AETHER_STOREFRONT_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  "NEXT_PUBLIC_PORTFOLIO_URL"
];

function parseEnv(contents) {
  const values = new Map();

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values.set(key, value);
  }

  return values;
}

function serialize(values, keys) {
  return keys
    .filter((key) => values.has(key))
    .map((key) => `${key}=${JSON.stringify(values.get(key) ?? "")}`)
    .join("\n")
    .concat("\n");
}

const values = parseEnv(readFileSync(envPath, "utf8"));

const apiDevVars = join(root, "apps", "api", ".dev.vars");
const storefrontEnv = join(root, "apps", "storefront", ".env.local");
const adminEnv = join(root, "apps", "admin", ".env.local");

mkdirSync(dirname(apiDevVars), { recursive: true });
mkdirSync(dirname(storefrontEnv), { recursive: true });
mkdirSync(dirname(adminEnv), { recursive: true });

writeFileSync(apiDevVars, serialize(values, workerKeys));
writeFileSync(storefrontEnv, serialize(values, publicKeys));
writeFileSync(adminEnv, serialize(values, publicKeys));

console.log("Environment files synced without printing secret values.");
