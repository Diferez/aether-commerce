import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreDirectory = resolve(root, "database/core");
const manifest = JSON.parse(readFileSync(resolve(coreDirectory, "client-migrations.manifest.json"), "utf8"));

// destination is caller/CLI-controlled (a new client repo can legitimately
// live anywhere on disk, so this can't be scoped to a fixed parent
// directory) - canonicalize it once here and reject the couple of inputs
// that would be destructive if mkdirSync/writeFileSync ran against them
// (empty, or a filesystem root), rather than trusting the raw argument.
export function materializeClientMigrations(destination) {
  if (typeof destination !== "string" || destination.trim() === "") {
    throw new Error("materializeClientMigrations requires a non-empty destination path.");
  }
  const resolvedDestination = resolve(destination);
  if (resolvedDestination === resolve(sep) || resolvedDestination === root) {
    throw new Error(`Refusing to materialize migrations into an unsafe destination: ${resolvedDestination}`);
  }
  if (existsSync(resolvedDestination)) throw new Error(`Refusing to overwrite existing migrations directory: ${resolvedDestination}`);
  mkdirSync(resolvedDestination, { recursive: true });
  for (const migration of manifest.migrations) {
    const source = resolve(coreDirectory, "migrations", migration);
    if (!existsSync(source)) throw new Error(`Core migration is missing: ${migration}`);
    cpSync(source, resolve(resolvedDestination, migration));
  }
  writeFileSync(
    resolve(resolvedDestination, "README.md"),
    "Generated from Aether core migration sources. Do not edit generated historical files; add new client-specific migrations beside them.\n"
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) throw new Error("Usage: node scripts/export-core-migrations.mjs <destination>");
  materializeClientMigrations(resolve(process.cwd(), destination));
  console.log(`Materialized ${manifest.migrations.length} core migrations in ${resolve(process.cwd(), destination)}`);
}
