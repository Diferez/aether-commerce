import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const policies = new Map([
  ["api-client", new Set(["@aether/schemas"])],
  ["api-core", new Set(["@aether/core", "@aether/schemas"])],
  ["agent-core", new Set(["@aether/core", "@aether/schemas", "@aether/observability"])],
  ["config", new Set(["@aether/config-schema"])],
  ["config-schema", new Set()],
  ["core", new Set(["@aether/schemas"])],
  ["i18n", new Set()],
  ["observability", new Set()],
  ["schemas", new Set()],
  ["ui", new Set(["@aether/core", "@aether/schemas"])],
]);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" ? [] : files(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const violations = [];
const normalizePackageImport = (value) => value.match(/^@aether\/[^/]+/)?.[0] ?? value;
for (const [packageName, allowed] of policies) {
  const source = resolve(root, "packages", packageName, "src");
  for (const file of files(source)) {
    const content = readFileSync(file, "utf8");
    const imports = [...content.matchAll(/(?:from|import)\s*\(?\s*["'](@aether\/[^"']+)["']/g)].map((match) => match[1]);
    for (const importedPath of imports) {
      const dependency = normalizePackageImport(importedPath);
      if (!allowed.has(dependency)) violations.push(`${file}: ${packageName} may not depend on ${dependency}`);
      if (importedPath !== dependency && importedPath !== "@aether/ui/theme") {
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
    if (/@aether\/[^"'\/]+\/src(?:\/|["'])/.test(content)) {
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
