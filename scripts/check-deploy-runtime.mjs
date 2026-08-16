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
const production = (process.env.AETHER_DEPLOY_ENV || "production") === "production";
const allowClerkDevelopmentKeys = process.env.ALLOW_CLERK_DEVELOPMENT_KEYS === "true";

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

if (production && !allowClerkDevelopmentKeys && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith("pk_live_")) {
  console.error("Production requires a Clerk pk_live_ publishable key unless ALLOW_CLERK_DEVELOPMENT_KEYS=true.");
  process.exitCode = 1;
}

if (production && !allowClerkDevelopmentKeys && process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.startsWith("sk_live_")) {
  console.error("Production requires a Clerk sk_live_ secret key unless ALLOW_CLERK_DEVELOPMENT_KEYS=true.");
  process.exitCode = 1;
}

if (production && allowClerkDevelopmentKeys) {
  console.warn("WARNING: production deployment is explicitly using Clerk development keys.");
}

for (const name of ["APP_ORIGIN_STORE", "APP_ORIGIN_ADMIN", "NEXT_PUBLIC_AETHER_API_URL", "NEXT_PUBLIC_AETHER_AI_URL"]) {
  const value = process.env[name];
  if (production && value && !value.startsWith("https://")) {
    console.error(`${name} must use HTTPS in production.`);
    process.exitCode = 1;
  }
}

for (const name of ["AETHER_CART_TOKEN_SECRET", "AI_OPERATIONS_TOKEN"]) {
  const value = process.env[name];
  if (value && value.length < 32) {
    console.error(`${name} must contain at least 32 characters.`);
    process.exitCode = 1;
  }
}

if (!process.exitCode) {
  console.log("deploy_runtime_config_ok");
}
