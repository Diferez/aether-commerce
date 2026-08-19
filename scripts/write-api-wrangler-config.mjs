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
      name: "RATE_LIMITER_ACCOUNT",
      namespace_id: process.env.AETHER_RATE_LIMIT_ACCOUNT_NAMESPACE_ID || (deployEnvironment === "production" ? "4104" : "5104"),
      simple: { limit: Number(process.env.AETHER_RATE_LIMIT_ACCOUNT_PER_MINUTE || 600), period: 60 },
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
    GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    AI_PROVIDER: process.env.AI_PROVIDER || "gemini",
    ADMIN_CHAT_MUTATIONS_ENABLED: process.env.ADMIN_CHAT_MUTATIONS_ENABLED || "true",
    ADMIN_CHAT_MAX_INPUT_CHARACTERS: process.env.ADMIN_CHAT_MAX_INPUT_CHARACTERS || "4000",
    ADMIN_CHAT_PENDING_ACTION_TTL_MINUTES: process.env.ADMIN_CHAT_PENDING_ACTION_TTL_MINUTES || "5",
  },
  triggers: {
    crons: ["*/5 * * * *"],
  },
  d1_databases: [
    {
      binding: "DB",
      database_name:
        process.env.AETHER_D1_DATABASE_NAME ||
        (deployEnvironment === "production" ? "aether-production" : "aether-development"),
      database_id: databaseId,
      migrations_dir: "../../database/core/migrations",
    },
  ],
};

const outputPath = resolve("apps/api", outputFile);
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
