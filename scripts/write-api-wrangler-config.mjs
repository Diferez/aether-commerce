import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const databaseId = process.env.AETHER_D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error("AETHER_D1_DATABASE_ID is required.");
}

const config = {
  $schema: "../../node_modules/wrangler/config-schema.json",
  name: process.env.AETHER_API_WORKER_NAME || "aether-api",
  main: "src/index.ts",
  compatibility_date: "2026-08-08",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  preview_urls: true,
  observability: { enabled: true, head_sampling_rate: 1 },
  vars: {
    AETHER_ENV: "production",
    APP_ORIGIN_STORE: process.env.APP_ORIGIN_STORE || "",
    APP_ORIGIN_ADMIN: process.env.APP_ORIGIN_ADMIN || "",
    APP_STORE_BASE_PATH: process.env.APP_STORE_BASE_PATH || "",
  },
  d1_databases: [
    {
      binding: "DB",
      database_name: process.env.AETHER_D1_DATABASE_NAME || "aether-production",
      database_id: databaseId,
      migrations_dir: "migrations",
    },
  ],
};

const outputPath = resolve("apps/api/wrangler.production.json");
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
