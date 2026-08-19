const requiredVariables = [
  "AETHER_D1_DATABASE_ID",
  "APP_ORIGIN_STORE",
  "APP_ORIGIN_ADMIN",
  "NEXT_PUBLIC_AETHER_API_URL",
  "NEXT_PUBLIC_AETHER_AI_URL",
  "NEXT_PUBLIC_PORTFOLIO_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
];

const requiredSecrets = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "AETHER_CART_TOKEN_SECRET",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_ISSUER",
  "GEMINI_API_KEY",
  "AI_OPERATIONS_TOKEN"
];

const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());
const missingSecrets = requiredSecrets.filter((name) => !process.env[name]?.trim());

if (process.env.CLOUDFLARE_DEPLOY_ENABLED !== "true") {
  console.error("CLOUDFLARE_DEPLOY_ENABLED must be exactly 'true'.");
  process.exitCode = 1;
}

if (missingVariables.length) {
  console.error(`Missing deployment variables: ${missingVariables.join(", ")}`);
  process.exitCode = 1;
}

if (missingSecrets.length) {
  console.error(`Missing deployment secrets: ${missingSecrets.join(", ")}`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log("deploy_runtime_config_ok");
}
