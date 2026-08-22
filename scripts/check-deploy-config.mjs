import { spawnSync } from "node:child_process";

const environment = process.argv[2] || "production";
const repository = process.env.GITHUB_REPOSITORY || process.argv[3] || "aether-commerce/aether-commerce";

if (!/^[a-z0-9-]+$/i.test(environment)) {
  throw new Error(`Invalid GitHub environment name: ${environment}`);
}

const requiredVariables = [
  "CLOUDFLARE_DEPLOY_ENABLED",
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

function list(kind, args) {
  const result = spawnSync("gh", [kind, "list", "--repo", repository, ...args, "--json", "name"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  });

  if (result.status !== 0) {
    return { names: new Set(), error: result.stderr.trim() || `Unable to list GitHub ${kind}s.` };
  }

  return {
    names: new Set(JSON.parse(result.stdout).map((entry) => entry.name)),
    error: null
  };
}

function combinedNames(kind) {
  const repository = list(kind, []);
  const scoped = list(kind, ["--env", environment]);

  if (repository.error) {
    throw new Error(repository.error);
  }

  if (scoped.error && /404|not found/i.test(scoped.error)) {
    throw new Error(
      `GitHub environment '${environment}' does not exist. Create it before configuring deployment values.`
    );
  }

  if (scoped.error) {
    throw new Error(scoped.error);
  }

  return new Set([...repository.names, ...scoped.names]);
}

const variables = combinedNames("variable");
const secrets = combinedNames("secret");
const missingVariables = requiredVariables.filter((name) => !variables.has(name));
const missingSecrets = requiredSecrets.filter((name) => !secrets.has(name));

if (missingVariables.length || missingSecrets.length) {
  if (missingVariables.length) console.error(`Missing variables: ${missingVariables.join(", ")}`);
  if (missingSecrets.length) console.error(`Missing secrets: ${missingSecrets.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`deploy_config_ok:${environment}`);
}
