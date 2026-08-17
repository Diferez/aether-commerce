import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createClient } from "./create-client.mjs";

const root = process.cwd();
const required = [
  "config/brand.ts", "config/store.ts", "config/features.ts", "config/checkout.ts", "config/integrations.ts", "config/agent.ts", "config/navigation.ts", "src/configuration.ts",
  "apps/storefront/adapter.ts", "apps/admin/adapter.ts", "apps/api/adapter.ts", "apps/ai/adapter.ts", "src/adapters.ts",
  "custom/animations/.gitkeep", "custom/components/.gitkeep", "custom/pages/.gitkeep", "custom/styles/.gitkeep", "custom/assets/.gitkeep",
  "database/extensions/.gitkeep", "database/seeds/.gitkeep", ".npmrc", "README.md", "package.json", "tsconfig.json", "tsconfig.validation.json"
];
const template = resolve(root, "templates/client");
for (const entry of required) if (!existsSync(resolve(template, entry))) throw new Error(`Client template is missing ${entry}`);
execFileSync("pnpm", ["exec", "tsc", "-p", "templates/client/tsconfig.validation.json", "--noEmit"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

const temporaryParent = mkdtempSync(join(tmpdir(), "aether-client-template-"));
try {
  const generated = createClient("validation-store", { destinationParent: temporaryParent });
  for (const entry of [
    "apps/storefront/adapter.ts", "apps/admin/adapter.ts", "apps/api/adapter.ts", "apps/ai/adapter.ts",
    "database/migrations/0001_initial.sql", "database/migrations/0005_ai_assistant.sql", ".npmrc"
  ]) {
    if (!existsSync(resolve(generated, entry))) throw new Error(`Generated client is missing ${entry}`);
  }
  if (existsSync(resolve(generated, "tsconfig.validation.json"))) throw new Error("Generated client retained monorepo-only validation config");
} finally {
  rmSync(temporaryParent, { recursive: true, force: true });
}

console.log("Client template structure, generation and TypeScript configuration are valid.");
