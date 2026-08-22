import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  buildApiDeployConfig,
  extractJsonStringProperty,
  parseWranglerJson,
  replaceJsonStringProperty
} from "../scripts/bootstrap-cloudflare.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("reads and replaces JSONC string properties without evaluating config", () => {
  const source = '{\n  "name": "client-store-api",\n  "database_id": "placeholder"\n}\n';
  assert.equal(extractJsonStringProperty(source, "name"), "client-store-api");
  assert.match(replaceJsonStringProperty(source, "database_id", "real-id"), /"database_id": "real-id"/);
});

test("builds an account-specific production config while preserving the template", () => {
  const source = readFileSync(resolve(root, "apps/api/wrangler.jsonc"), "utf8");
  const generated = buildApiDeployConfig(source, {
    databaseId: "11111111-2222-3333-4444-555555555555",
    storeOrigin: "https://client-store.example.workers.dev",
    adminOrigin: "https://client-store-admin.pages.dev"
  });

  assert.match(generated, /"database_id": "11111111-2222-3333-4444-555555555555"/);
  assert.match(generated, /"AETHER_ENV": "production"/);
  assert.match(generated, /"APP_ORIGIN_STORE": "https:\/\/client-store\.example\.workers\.dev"/);
  assert.match(generated, /"APP_ORIGIN_ADMIN": "https:\/\/client-store-admin\.pages\.dev"/);
  assert.match(source, /00000000-0000-4000-8000-000000000000/);
});

test("deployment bootstraps Cloudflare before builds and uses generated outputs", () => {
  const workflow = readFileSync(resolve(root, ".github/workflows/deploy.yml"), "utf8");
  assert.match(workflow, /name: Bootstrap Cloudflare resources/);
  assert.match(workflow, /run: pnpm cloudflare:bootstrap/);
  assert.match(workflow, /steps\.cloudflare\.outputs\.api_url/);
  assert.match(workflow, /wrangler\.deploy\.jsonc/);
  assert.match(workflow, /push:\s*[\s\S]*branches:\s*[\s\S]*- main/);
});

test("runs Wrangler from the workspace that owns its dependency", () => {
  const script = readFileSync(resolve(root, "scripts/bootstrap-cloudflare.mjs"), "utf8");
  assert.match(script, /\["-C", "apps\/api", "exec", "wrangler"/);
});

test("accepts Wrangler JSON surrounded by informational output", () => {
  assert.deepEqual(parseWranglerJson("warning from pnpm\n[{\"name\":\"client-store\"}]\n", "d1 list"), [
    { name: "client-store" },
  ]);
});
