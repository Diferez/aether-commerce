import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDirectory = resolve(root, "database/core");
const manifest = JSON.parse(readFileSync(resolve(coreDirectory, "client-migrations.manifest.json"), "utf8"));

export function materializeClientMigrations(destination) {
  if (existsSync(destination)) throw new Error(`Refusing to overwrite existing migrations directory: ${destination}`);
  mkdirSync(destination, { recursive: true });
  for (const migration of manifest.migrations) {
    const source = resolve(coreDirectory, "migrations", migration);
    if (!existsSync(source)) throw new Error(`Core migration is missing: ${migration}`);
    cpSync(source, resolve(destination, migration));
  }
  writeFileSync(
    resolve(destination, "README.md"),
    "Generated from Aether core migration sources. Do not edit generated historical files; add new client-specific migrations beside them.\n"
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) throw new Error("Usage: node scripts/export-core-migrations.mjs <destination>");
  materializeClientMigrations(resolve(process.cwd(), destination));
  console.log(`Materialized ${manifest.migrations.length} core migrations in ${resolve(process.cwd(), destination)}`);
}
