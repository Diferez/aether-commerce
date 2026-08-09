import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const deployEnvironment = process.env.AETHER_DEPLOY_ENV || "production";
const outputFile = process.env.AETHER_API_WRANGLER_OUTPUT || `wrangler.${deployEnvironment}.json`;
const databaseId = process.env.AETHER_D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error("AETHER_D1_DATABASE_ID is required.");
}

const config = {
  $schema: "../../node_modules/wrangler/config-schema.json",
  name: process.env.AETHER_API_WORKER_NAME || (deployEnvironment === "production" ? "aether-api" : "aether-api-dev"),
  main: "src/index.ts",
  compatibility_date: "2026-08-08",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  preview_urls: true,
  observability: { enabled: true, head_sampling_rate: 1 },
  ratelimits: [
    {
      name: "RATE_LIMITER_GLOBAL",
      namespace_id: process.env.AETHER_RATE_LIMIT_GLOBAL_NAMESPACE_ID || (deployEnvironment === "production" ? "4101" : "5101"),
      simple: { limit: Number(process.env.AETHER_RATE_LIMIT_GLOBAL_PER_MINUTE || 240), period: 60 },
    },
    {
      name: "RATE_LIMITER_MUTATION",
      namespace_id: process.env.AETHER_RATE_LIMIT_MUTATION_NAMESPACE_ID || (deployEnvironment === "production" ? "4102" : "5102"),
      simple: { limit: Number(process.env.AETHER_RATE_LIMIT_MUTATION_PER_MINUTE || 60), period: 60 },
    },
    {
      name: "RATE_LIMITER_SENSITIVE",
      namespace_id: process.env.AETHER_RATE_LIMIT_SENSITIVE_NAMESPACE_ID || (deployEnvironment === "production" ? "4103" : "5103"),
      simple: { limit: Number(process.env.AETHER_RATE_LIMIT_SENSITIVE_PER_MINUTE || 20), period: 60 },
    },
  ],
  vars: {
    AETHER_ENV: deployEnvironment,
    APP_ORIGIN_STORE: process.env.APP_ORIGIN_STORE || "",
    APP_ORIGIN_ADMIN: process.env.APP_ORIGIN_ADMIN || "",
    APP_STORE_BASE_PATH: process.env.APP_STORE_BASE_PATH || "",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name:
        process.env.AETHER_D1_DATABASE_NAME ||
        (deployEnvironment === "production" ? "aether-production" : "aether-development"),
      database_id: databaseId,
      migrations_dir: "migrations",
    },
  ],
};

const outputPath = resolve("apps/api", outputFile);
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
