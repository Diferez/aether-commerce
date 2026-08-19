import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const deployEnvironment = process.env.AETHER_DEPLOY_ENV || "production";
const outputFile = process.env.AETHER_AI_WRANGLER_OUTPUT || `wrangler.${deployEnvironment}.json`;
const databaseId = process.env.AETHER_D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error("AETHER_D1_DATABASE_ID is required.");
}

const inputPath = resolve("apps/ai-assistant/wrangler.jsonc");
const config = JSON.parse(readFileSync(inputPath, "utf8"));

config.name =
  process.env.AETHER_AI_WORKER_NAME ||
  (deployEnvironment === "production" ? "aether-ai" : "aether-ai-dev");
config.vars = {
  ...config.vars,
  AETHER_API_BASE_URL:
    process.env.NEXT_PUBLIC_AETHER_API_URL || config.vars.AETHER_API_BASE_URL,
  AI_CORS_ALLOWED_ORIGINS:
    process.env.APP_ORIGIN_STORE || config.vars.AI_CORS_ALLOWED_ORIGINS,
  AI_DEPLOYMENT_ENVIRONMENT: deployEnvironment,
  AI_TOOL_CALLING_ENABLED:
    process.env.AI_TOOL_CALLING_ENABLED || config.vars.AI_TOOL_CALLING_ENABLED,
  AI_MUTATIONS_ENABLED: process.env.AI_MUTATIONS_ENABLED || config.vars.AI_MUTATIONS_ENABLED,
};
config.services = [
  {
    binding: "AETHER_API",
    service:
      process.env.AETHER_API_WORKER_NAME ||
      (deployEnvironment === "production" ? "aether-api" : "aether-api-dev"),
  },
];
config.d1_databases = [
  {
    binding: "DB",
    database_name:
      process.env.AETHER_D1_DATABASE_NAME ||
      (deployEnvironment === "production" ? "aether-production" : "aether-development"),
    database_id: databaseId,
    migrations_dir: "../../database/core/migrations",
  },
];

const outputPath = resolve("apps/ai-assistant", outputFile);
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
