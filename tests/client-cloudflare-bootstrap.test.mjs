import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { buildApiDeployConfig } from "../templates/client/scripts/bootstrap-cloudflare.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const template = resolve(root, "templates/client");

test("client template keeps Cloudflare configuration portable", () => {
  const source = readFileSync(resolve(template, "apps/api/wrangler.jsonc"), "utf8");
  assert.match(source, /00000000-0000-4000-8000-000000000000/);

  const generated = buildApiDeployConfig(source, {
    databaseId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    storeOrigin: "https://acme.example.workers.dev",
    adminOrigin: "https://acme-admin.pages.dev"
  });
  assert.match(generated, /aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/);
  assert.match(generated, /"AETHER_ENV": "production"/);
});

test("client deployment bootstraps resources and consumes its outputs", () => {
  const workflow = readFileSync(resolve(template, ".github/workflows/deploy.yml"), "utf8");
  assert.match(workflow, /name: Bootstrap Cloudflare resources/);
  assert.match(workflow, /run: pnpm cloudflare:bootstrap/);
  assert.match(workflow, /steps\.cloudflare\.outputs\.api_url/);
  assert.match(workflow, /steps\.cloudflare\.outputs\.api_config/);
  assert.match(workflow, /push:\s*[\s\S]*branches:\s*[\s\S]*- main/);
});
