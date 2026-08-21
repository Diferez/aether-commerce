#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "client-migrations.manifest.json"), "utf8"));

export function syncMigrations(destination) {
  if (typeof destination !== "string" || !destination.trim()) {
    throw new Error("A destination directory is required.");
  }

  const targetDirectory = resolve(process.cwd(), destination);
  mkdirSync(targetDirectory, { recursive: true });
  const added = [];

  for (const migration of manifest.migrations) {
    const source = resolve(packageRoot, "migrations", migration);
    const target = resolve(targetDirectory, migration);
    if (!existsSync(source)) throw new Error(`Published migration is missing: ${migration}`);
    if (existsSync(target)) {
      if (readFileSync(source, "utf8") !== readFileSync(target, "utf8")) {
        throw new Error(`Migration ${migration} differs from Aether's immutable source.`);
      }
      continue;
    }
    copyFileSync(source, target);
    added.push(migration);
  }

  return { added, total: manifest.migrations.length, destination: targetDirectory };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, destination = "database/migrations"] = process.argv.slice(2);
  if (command !== "sync") throw new Error("Usage: aether-migrations sync [database/migrations]");
  const result = syncMigrations(destination);
  console.log(result.added.length ? `Added ${result.added.join(", ")}` : `All ${result.total} Aether migrations are present.`);
}
