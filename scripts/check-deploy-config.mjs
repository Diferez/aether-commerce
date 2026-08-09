import { spawnSync } from "node:child_process";

const requiredVariables = [
  "CLOUDFLARE_DEPLOY_ENABLED",
  "AETHER_D1_DATABASE_ID",
  "APP_ORIGIN_STORE",
  "APP_ORIGIN_ADMIN",
  "NEXT_PUBLIC_AETHER_API_URL",
  "NEXT_PUBLIC_AETHER_AI_URL",
  "NEXT_PUBLIC_PORTFOLIO_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
];
const requiredSecrets = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "AETHER_CART_TOKEN_SECRET",
];

function names(kind) {
  const result = spawnSync("gh", [kind, "list", "--env", "production", "--json", "name"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Unable to list GitHub ${kind}s.`);
  }

  return new Set(JSON.parse(result.stdout).map((entry) => entry.name));
}

const variables = names("variable");
const secrets = names("secret");
const missingVariables = requiredVariables.filter((name) => !variables.has(name));
const missingSecrets = requiredSecrets.filter((name) => !secrets.has(name));

if (missingVariables.length || missingSecrets.length) {
  if (missingVariables.length) console.error(`Missing variables: ${missingVariables.join(", ")}`);
  if (missingSecrets.length) console.error(`Missing secrets: ${missingSecrets.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("deploy_config_ok");
}
