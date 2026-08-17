import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const required = [
  "config/brand.ts", "config/store.ts", "config/features.ts", "config/checkout.ts", "config/integrations.ts", "config/agent.ts",
  "apps/storefront/.gitkeep", "apps/admin/.gitkeep", "apps/api/.gitkeep", "apps/ai/.gitkeep",
  "custom/animations/.gitkeep", "custom/components/.gitkeep", "custom/pages/.gitkeep", "custom/styles/.gitkeep", "custom/assets/.gitkeep",
  "database/extensions/.gitkeep", "database/seeds/.gitkeep", "README.md", "package.json", "tsconfig.json"
];
const template = resolve(root, "templates/client");
for (const entry of required) if (!existsSync(resolve(template, entry))) throw new Error(`Client template is missing ${entry}`);
execFileSync("pnpm", ["exec", "tsc", "-p", "templates/client/tsconfig.json", "--noEmit"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
console.log("Client template structure and TypeScript configuration are valid.");
