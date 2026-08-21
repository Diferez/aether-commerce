import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeClientMigrations } from "./export-core-migrations.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function replaceText(directory, name) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) replaceText(target, name);
    else if (/\.(json|jsonc|md|ts|tsx|ya?ml)$/.test(entry.name)) {
      writeFileSync(target, readFileSync(target, "utf8").replaceAll("client-store", name).replaceAll("Client Store", name));
    }
  }
}

function publicAetherVersions() {
  const versions = new Map();
  for (const entry of readdirSync(resolve(root, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = resolve(root, "packages", entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.private === false && typeof manifest.name === "string" && typeof manifest.version === "string") {
      versions.set(manifest.name, manifest.version);
    }
  }
  return versions;
}

function synchronizePackageVersions(directory) {
  const versions = publicAetherVersions();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      synchronizePackageVersions(target);
      continue;
    }
    if (entry.name !== "package.json") continue;
    const manifest = JSON.parse(readFileSync(target, "utf8"));
    let changed = false;
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      for (const packageName of Object.keys(manifest[section] ?? {})) {
        const version = versions.get(packageName);
        if (!version) continue;
        manifest[section][packageName] = `^${version}`;
        changed = true;
      }
    }
    if (changed) writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

/** Generates a repository-ready client implementation without changing Aether itself. */
export function createClient(name, options = {}) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) throw new Error("Client name must be kebab-case.");
  const source = resolve(options.source ?? root, "templates/client");
  const destination = resolve(options.destinationParent ?? resolve(root, ".."), name);
  if (existsSync(destination)) throw new Error(`Refusing to overwrite existing directory: ${destination}`);

  cpSync(source, destination, { recursive: true });
  rmSync(resolve(destination, "tsconfig.validation.json"));
  materializeClientMigrations(resolve(destination, "database/migrations"));
  synchronizePackageVersions(destination);
  replaceText(destination, name);
  return destination;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!name) throw new Error("Usage: pnpm create:client <kebab-case-name>");
  console.log(`Created ${createClient(name)}`);
}
