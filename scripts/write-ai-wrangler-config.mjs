import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const databaseId = process.env.AETHER_D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error("AETHER_D1_DATABASE_ID is required.");
}

const inputPath = resolve("apps/ai-assistant/wrangler.jsonc");
const config = JSON.parse(readFileSync(inputPath, "utf8"));

config.vars = {
  ...config.vars,
  AETHER_API_BASE_URL:
    process.env.NEXT_PUBLIC_AETHER_API_URL || config.vars.AETHER_API_BASE_URL,
  AI_CORS_ALLOWED_ORIGINS:
    process.env.APP_ORIGIN_STORE || config.vars.AI_CORS_ALLOWED_ORIGINS,
  AI_DEPLOYMENT_ENVIRONMENT: "production",
};
config.services = [
  {
    binding: "AETHER_API",
    service: process.env.AETHER_API_WORKER_NAME || "aether-api",
  },
];
config.d1_databases = [
  {
    binding: "DB",
    database_name: process.env.AETHER_D1_DATABASE_NAME || "aether-production",
    database_id: databaseId,
    migrations_dir: "../api/migrations",
  },
];

const outputPath = resolve("apps/ai-assistant/wrangler.production.json");
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
