import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { materializeClientMigrations } from "./export-core-migrations.mjs";

const name = process.argv[2];
if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  throw new Error("Usage: pnpm create:client <kebab-case-name>");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "templates/client");
const destination = resolve(root, "..", name);
if (existsSync(destination)) throw new Error(`Refusing to overwrite existing directory: ${destination}`);

cpSync(source, destination, { recursive: true });
rmSync(resolve(destination, "tsconfig.validation.json"));
materializeClientMigrations(resolve(destination, "database/migrations"));
const replaceText = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    if (entry.isDirectory()) replaceText(target);
    else if (/\.(json|md|ts)$/.test(entry.name)) {
      writeFileSync(target, readFileSync(target, "utf8").replaceAll("client-store", name).replaceAll("Client Store", name));
    }
  }
};
replaceText(destination);
console.log(`Created ${destination}`);
