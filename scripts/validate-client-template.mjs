import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { createClient } from "./create-client.mjs";

const root = process.cwd();
const required = [
  "config/brand.ts", "config/store.ts", "config/features.ts", "config/theme.ts", "config/checkout.ts", "config/integrations.ts", "config/agent.ts", "config/navigation.ts", "src/configuration.ts",
  "apps/storefront/adapter.ts", "apps/storefront/app/layout.tsx", "apps/storefront/app/page.tsx", "apps/storefront/package.json", "apps/storefront/next.config.mjs", "apps/storefront/wrangler.jsonc",
  "apps/admin/adapter.ts", "apps/admin/app/layout.tsx", "apps/admin/app/page.tsx", "apps/admin/package.json", "apps/admin/next.config.mjs",
  "apps/api/adapter.ts", "apps/ai/adapter.ts", "src/adapters.ts",
  "custom/animations/.gitkeep", "custom/components/.gitkeep", "custom/pages/.gitkeep", "custom/styles/.gitkeep", "custom/assets/.gitkeep",
  "database/extensions/.gitkeep", "database/seeds/.gitkeep", ".npmrc", ".gitignore", "README.md", "package.json", "pnpm-workspace.yaml", "tsconfig.json", "tsconfig.validation.json"
];
const template = resolve(root, "templates/client");
const distributablePackages = [
  ["@aether/core", "packages/core"],
  ["@aether/schemas", "packages/schemas"],
  ["@aether/api-client", "packages/api-client"],
  ["@aether/ui", "packages/ui"],
  ["@aether/i18n", "packages/i18n"],
  ["@aether/config-schema", "packages/config-schema"],
  ["@aether/api-core", "packages/api-core"],
  ["@aether/agent-core", "packages/agent-core"],
  ["@aether/observability", "packages/observability"],
  ["@aether/storefront-default", "packages/storefront-default"],
  ["@aether/admin-default", "packages/admin-default"]
];
for (const entry of required) if (!existsSync(resolve(template, entry))) throw new Error(`Client template is missing ${entry}`);
execFileSync("pnpm", ["exec", "tsc", "-p", "templates/client/tsconfig.validation.json", "--noEmit"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

const temporaryParent = mkdtempSync(join(tmpdir(), "aether-client-template-"));
try {
  const generated = createClient("validation-store", { destinationParent: temporaryParent });
  for (const entry of [
    "apps/storefront/adapter.ts", "apps/storefront/app/layout.tsx", "apps/storefront/app/page.tsx",
    "apps/admin/adapter.ts", "apps/admin/app/layout.tsx", "apps/admin/app/page.tsx",
    "apps/api/adapter.ts", "apps/ai/adapter.ts",
    "database/migrations/0001_initial.sql", "database/migrations/0005_ai_assistant.sql", ".npmrc"
  ]) {
    if (!existsSync(resolve(generated, entry))) throw new Error(`Generated client is missing ${entry}`);
  }
  if (existsSync(resolve(generated, "tsconfig.validation.json"))) throw new Error("Generated client retained monorepo-only validation config");
  const archivesDirectory = resolve(temporaryParent, "archives");
  const archives = new Map();
  for (const [name, packageDirectory] of distributablePackages) {
    // turbo's `^build` graph only builds a package as a side effect of `pnpm
    // typecheck`/`pnpm lint` when something else in the workspace still
    // depends on it. A distributable package can lose its last in-monorepo
    // consumer (as @aether/i18n and @aether/agent-core have) while still
    // needing to work for external client consumers, so build it explicitly
    // here rather than trusting it was already built.
    execFileSync("pnpm", ["build"], {
      cwd: resolve(root, packageDirectory),
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    const existingArchives = new Set(existsSync(archivesDirectory) ? readdirSync(archivesDirectory) : []);
    execFileSync("pnpm", ["pack", "--pack-destination", archivesDirectory], {
      cwd: resolve(root, packageDirectory),
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    const archive = readdirSync(archivesDirectory).find((entry) => entry.endsWith(".tgz") && !existingArchives.has(entry));
    if (!archive) throw new Error(`Could not pack ${name}`);
    archives.set(name, resolve(archivesDirectory, archive));
  }
  const manifestPath = resolve(generated, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const archiveOverrides = {};
  for (const [name, archive] of archives) {
    const localArchive = `file:${relative(generated, archive).split(sep).join("/")}`;
    manifest.dependencies[name] = localArchive;
    archiveOverrides[name] = localArchive;
  }
  manifest.pnpm = { ...manifest.pnpm, overrides: { ...manifest.pnpm?.overrides, ...archiveOverrides } };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // src/adapters.ts and src/configuration.ts only import type-only symbols
  // from @aether/config-schema, a single-file package - that alone never
  // exercises the *built* dist/ declarations of a multi-file package (an
  // `export * from "./x"` chain resolves differently than in-monorepo source
  // resolution, e.g. #2094). Import one real value export from every packed
  // package so a client's own tsconfig module resolution is actually proven
  // against the published output, not just the template's own thin files.
  writeFileSync(
    resolve(generated, "src/__package_resolution_smoke__.ts"),
    [
      'import { formatMoney } from "@aether/core";',
      'import { currencyCodeSchema } from "@aether/schemas";',
      'import { createCommerceClient } from "@aether/api-client";',
      'import { Button } from "@aether/ui";',
      'import { getDictionary } from "@aether/i18n";',
      'import { defineClientConfiguration } from "@aether/config-schema";',
      'import { isCheckoutSessionPaid } from "@aether/api-core";',
      'import { supportedAgentIntents } from "@aether/agent-core";',
      'import { createRequestId } from "@aether/observability";',
      'import { Hero, ProductGrid, CartProvider } from "@aether/storefront-default";',
      'import { AdminSidebar } from "@aether/admin-default";',
      "",
      "export const packageResolutionSmoke = [",
      "  formatMoney,",
      "  currencyCodeSchema,",
      "  createCommerceClient,",
      "  Button,",
      "  getDictionary,",
      "  defineClientConfiguration,",
      "  isCheckoutSessionPaid,",
      "  supportedAgentIntents,",
      "  createRequestId,",
      "  Hero,",
      "  ProductGrid,",
      "  CartProvider,",
      "  AdminSidebar",
      "] as const;",
      ""
    ].join("\n")
  );

  execFileSync("pnpm", ["install", "--prefer-offline", "--ignore-scripts"], {
    cwd: generated,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, GITHUB_PACKAGES_TOKEN: "template-validation-token" }
  });
  execFileSync("pnpm", ["validate"], {
    cwd: generated,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, GITHUB_PACKAGES_TOKEN: "template-validation-token" }
  });

  // pnpm typecheck (above, via `validate`) only proves the TS types resolve -
  // it doesn't prove Next can actually export a static site from these
  // files. Build both apps for real against the packed tarballs. A real
  // deploy CI supplies NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY from a secret before
  // building (both apps require it at module-eval time, matching this
  // repo's own apps/admin and apps/storefront) - stand in a placeholder here.
  for (const appPath of ["./apps/admin", "./apps/storefront"]) {
    execFileSync("pnpm", ["--filter", appPath, "build"], {
      cwd: generated,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        GITHUB_PACKAGES_TOKEN: "template-validation-token",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_template_validation_placeholder"
      }
    });
  }
} finally {
  rmSync(temporaryParent, { recursive: true, force: true });
}

console.log("Client template structure, generation and TypeScript configuration are valid.");
