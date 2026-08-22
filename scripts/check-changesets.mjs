import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const base = process.env.GITHUB_BASE_REF;
if (!base) {
  console.log("Changeset enforcement only applies to pull requests.");
  process.exit(0);
}

// Resolve Git from a fixed, system-owned directory instead of trusting PATH.
// CI runs on Ubuntu; the Windows path keeps the check usable by maintainers.
const gitExecutable = process.platform === "win32" ? "C:\\Program Files\\Git\\cmd\\git.exe" : "/usr/bin/git";
const changes = execFileSync(gitExecutable, ["diff", "--name-status", `origin/${base}...HEAD`], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [status, ...pathParts] = line.split("\t");
    return { status, path: pathParts.at(-1) };
  });
const changed = changes.map(({ path }) => path);
const publicDirectories = readdirSync("packages", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `packages/${entry.name}`)
  .filter((directory) => {
    const manifest = resolve(directory, "package.json");
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, "utf8")).private === false;
  });
const changesPublicPackage = changed.some((file) => publicDirectories.some((directory) => file.startsWith(`${directory}/`)));
const isReleaseNote = (file) => /^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md";
const addsChangeset = changes.some(({ status, path }) => status === "A" && isReleaseNote(path));
const consumesChangeset = changes.some(({ status, path }) => status === "D" && isReleaseNote(path));

if (changesPublicPackage && !addsChangeset && !consumesChangeset) {
  throw new Error(
    "This pull request changes a distributable package but neither adds a release note nor consumes one in a version release."
  );
}
console.log(
  changesPublicPackage
    ? consumesChangeset
      ? "Version release consumes existing release metadata."
      : "Release metadata is present."
    : "No distributable package changed."
);
