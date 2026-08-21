import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const policies = new Map([
  ["api-client", new Set(["@aether-commerce/schemas"])],
  ["api-core", new Set(["@aether-commerce/core", "@aether-commerce/schemas"])],
  ["api-worker", new Set(["@aether-commerce/core", "@aether-commerce/api-core", "@aether-commerce/observability", "@aether-commerce/schemas"])],
  ["agent-core", new Set(["@aether-commerce/core", "@aether-commerce/schemas", "@aether-commerce/observability"])],
  ["config", new Set(["@aether-commerce/config-schema"])],
  ["config-schema", new Set()],
  ["core", new Set(["@aether-commerce/schemas"])],
  ["i18n", new Set()],
  ["observability", new Set()],
  ["schemas", new Set()],
  ["storefront-default", new Set(["@aether-commerce/api-client", "@aether-commerce/config-schema", "@aether-commerce/core", "@aether-commerce/schemas", "@aether-commerce/ui"])],
  ["admin-default", new Set(["@aether-commerce/config-schema", "@aether-commerce/schemas", "@aether-commerce/i18n", "@aether-commerce/ui", "@aether-commerce/core"])],
  ["ui", new Set(["@aether-commerce/core", "@aether-commerce/schemas"])],
]);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" ? [] : files(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const violations = [];
const normalizePackageImport = (value) => value.match(/^@aether-commerce\/[^/]+/)?.[0] ?? value;
for (const [packageName, allowed] of policies) {
  const source = resolve(root, "packages", packageName, "src");
  for (const file of files(source)) {
    const content = readFileSync(file, "utf8");
    const imports = [...content.matchAll(/(?:from|import)\s*\(?\s*["'](@aether-commerce\/[^"']+)["']/g)].map((match) => match[1]);
    for (const importedPath of imports) {
      const dependency = normalizePackageImport(importedPath);
      if (!allowed.has(dependency)) violations.push(`${file}: ${packageName} may not depend on ${dependency}`);
      if (importedPath !== dependency && importedPath !== "@aether-commerce/ui/theme") {
        violations.push(`${file}: platform packages must not import non-public subpaths (${importedPath})`);
      }
    }
    if (/\.\.\/\.\.\/apps\//.test(content)) violations.push(`${file}: platform packages may not import app internals`);
  }
}

for (const appName of ["admin", "api", "ai-assistant", "storefront"]) {
  const source = resolve(root, "apps", appName);
  for (const file of files(source)) {
    const content = readFileSync(file, "utf8");
    if (/from\s*["'][^"']*\.\.\/\.\.\/packages\//.test(content)) {
      violations.push(`${file}: apps must consume a package public entrypoint instead of packages/ source`);
    }
    if (/@aether-commerce\/[^"'\/]+\/src(?:\/|["'])/.test(content)) {
      violations.push(`${file}: apps must not import a package src internal path`);
    }
    if (/from\s*["'][^"']*\.\.\/[^"']*apps\//.test(content)) {
      violations.push(`${file}: apps must not import another app's internals`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exit(1);
}
console.log("Platform package boundaries are valid.");
