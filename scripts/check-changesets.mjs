import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.env.GITHUB_BASE_REF;
if (!base) {
  console.log("Changeset enforcement only applies to pull requests.");
  process.exit(0);
}

const changed = execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const publicDirectories = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`)
  .filter((directory) => {
    const manifest = resolve(directory, "package.json");
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).private === false;
  });
const changesPublicPackage = changed.some((file) => publicDirectories.some((directory) => file.startsWith(`${directory}/`)));
const addsChangeset = changed.some((file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md");

if (changesPublicPackage && !addsChangeset) {
  throw new Error("This pull request changes a distributable package but does not add a .changeset/*.md release note.");
}
console.log(changesPublicPackage ? "Release metadata is present." : "No distributable package changed.");
