import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const requiredRuntime = {
  CLOUDFLARE_DEPLOY_ENABLED: "true",
  AETHER_D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
  APP_ORIGIN_STORE: "https://store.example.com",
  APP_ORIGIN_ADMIN: "https://admin.example.com",
  NEXT_PUBLIC_AETHER_API_URL: "https://api.example.com",
  NEXT_PUBLIC_AETHER_AI_URL: "https://ai.example.com",
  NEXT_PUBLIC_PORTFOLIO_URL: "https://portfolio.example.com",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_example",
  CLOUDFLARE_API_TOKEN: "cloudflare-token",
  CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
  AETHER_CART_TOKEN_SECRET: "cart-secret-with-at-least-32-characters",
  CLERK_SECRET_KEY: "sk_live_example",
  CLERK_JWT_ISSUER: "https://clerk.example.com",
  GEMINI_API_KEY: "gemini-key",
  AI_OPERATIONS_TOKEN: "operations-token-with-at-least-32-chars"
};

test("validate includes Vitest and contract tests", () => {
  const packageJson = JSON.parse(read("package.json"));
  assert.match(packageJson.scripts.validate, /pnpm test:unit/);
  assert.match(packageJson.scripts.validate, /pnpm test/);
});

test("CI secret scan requires a credential-shaped value", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /sk\|rk\)_\(live\|test\)_\[A-Za-z0-9\]\{16,/);
  assert.match(workflow, /AIza\[0-9A-Za-z_-\]\{30,/);
  assert.match(workflow, /AKIA\[0-9A-Z\]\{16\}/);
  assert.match(workflow, /PRIVATE KEY/);
});

test("deployments wait for a successful CI run and deploy its exact SHA", () => {
  for (const file of ["deploy-production.yml", "deploy-development.yml"]) {
    const workflow = read(`.github/workflows/${file}`);
    assert.match(workflow, /workflow_run:/);
    assert.match(workflow, /workflow_run\.event == 'push'/);
    assert.match(workflow, /workflow_run\.conclusion == 'success'/);
    assert.match(workflow, /workflow_run\.head_sha \|\| github\.sha/);
    assert.match(workflow, /check-deploy-runtime\.mjs/);
    assert.doesNotMatch(workflow, /^\s{2}push:/m);
  }
});

test("CI builds and tests the Cloudflare LangGraph assistant", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /@aether-commerce\/ai-assistant typecheck/);
  assert.match(workflow, /@aether-commerce\/ai-assistant test/);
  assert.match(workflow, /@aether-commerce\/ai-assistant build/);
  assert.doesNotMatch(workflow, /docker build -t aether-ai-assistant/);
});

test("CI accepts version releases that consume existing changesets", () => {
  const workflow = read(".github/workflows/ci.yml");
  const checker = read("scripts/check-changesets.mjs");

  assert.match(workflow, /git diff --name-status/);
  assert.match(workflow, /Version release detected/);
  assert.match(checker, /status === "D"/);
  assert.match(checker, /consumesChangeset/);
});

test("AI deployments receive only secrets used by the assistant Worker", () => {
  for (const file of ["deploy-production.yml", "deploy-development.yml"]) {
    const workflow = read(`.github/workflows/${file}`);
    const bulkSecretCommand = workflow
      .split("\n")
      .find((line) => line.includes("fs.writeFileSync('.ai-secrets.json'"));

    assert.ok(bulkSecretCommand, `${file} must configure assistant secrets`);
    assert.match(bulkSecretCommand, /GEMINI_API_KEY/);
    assert.match(bulkSecretCommand, /AI_OPERATIONS_TOKEN/);
    assert.doesNotMatch(bulkSecretCommand, /AETHER_CART_TOKEN_SECRET/);
  }
});

test("runtime deployment preflight accepts a complete configuration", () => {
  const result = spawnSync(process.execPath, ["scripts/check-deploy-runtime.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, ...requiredRuntime }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /deploy_runtime_config_ok/);
});

test("runtime deployment preflight names missing values", () => {
  const env = { ...process.env, ...requiredRuntime };
  delete env.GEMINI_API_KEY;

  const result = spawnSync(process.execPath, ["scripts/check-deploy-runtime.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /GEMINI_API_KEY/);
});

test("runtime deployment preflight rejects Clerk development keys in production", () => {
  const result = spawnSync(process.execPath, ["scripts/check-deploy-runtime.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      ...requiredRuntime,
      ALLOW_CLERK_DEVELOPMENT_KEYS: "false",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example"
    }
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /pk_live_/);
  assert.match(result.stderr, /sk_live_/);
});

test("runtime deployment preflight permits Clerk development keys only with an explicit override", () => {
  assert.match(
    read(".github/workflows/deploy-production.yml"),
    /ALLOW_CLERK_DEVELOPMENT_KEYS: \$\{\{ vars\.ALLOW_CLERK_DEVELOPMENT_KEYS \}\}/
  );

  const result = spawnSync(process.execPath, ["scripts/check-deploy-runtime.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      ...requiredRuntime,
      ALLOW_CLERK_DEVELOPMENT_KEYS: "true",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example"
    }
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /deploy_runtime_config_ok/);
  assert.match(result.stderr, /explicitly using Clerk development keys/);
});
