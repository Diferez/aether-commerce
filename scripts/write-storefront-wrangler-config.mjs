import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const deployEnvironment = process.env.AETHER_DEPLOY_ENV || "production";
const outputFile =
  process.env.AETHER_STOREFRONT_WRANGLER_OUTPUT ||
  `wrangler.${deployEnvironment}.json`;

const inputPath = resolve("apps/storefront/wrangler.jsonc");
const config = JSON.parse(readFileSync(inputPath, "utf8"));

config.name =
  process.env.AETHER_FRONT_WORKER_NAME ||
  (deployEnvironment === "production"
    ? "aether-storefront"
    : "aether-storefront-dev");

const outputPath = resolve("apps/storefront", outputFile);
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
