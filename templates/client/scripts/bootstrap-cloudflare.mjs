import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ANSI_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g;

export function extractJsonStringProperty(source, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(
    new RegExp(`"${escaped}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`),
  );
  if (!match) throw new Error(`Missing JSONC string property: ${property}`);
  return JSON.parse(`"${match[1]}"`);
}

export function replaceJsonStringProperty(source, property, value) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `("${escaped}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`,
    "g",
  );
  const matches = source.match(pattern) ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `Expected one JSONC string property named ${property}; found ${matches.length}`,
    );
  }
  return source.replace(pattern, (_match, prefix) => `${prefix}${JSON.stringify(value)}`);
}

export function buildApiDeployConfig(
  source,
  { databaseId, storeOrigin, adminOrigin },
) {
  let result = replaceJsonStringProperty(source, "database_id", databaseId);
  result = replaceJsonStringProperty(result, "AETHER_ENV", "production");
  result = replaceJsonStringProperty(result, "APP_ORIGIN_STORE", storeOrigin);
  result = replaceJsonStringProperty(result, "APP_ORIGIN_ADMIN", adminOrigin);
  return result;
}

function parseWranglerJson(output, command) {
  const normalized = output.replace(ANSI_PATTERN, "").trim();
  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(`Wrangler returned invalid JSON for ${command}`, {
      cause: error,
    });
  }
}

function runWrangler(args) {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(executable, ["-C", "apps/api", "exec", "wrangler", ...args], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`Wrangler failed: wrangler ${args.join(" ")}`);
  }
  return result.stdout;
}

async function cloudflareRequest(pathname, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    const error = new Error(
      payload.errors?.map(({ message }) => message).join("; ") ||
        `Cloudflare request failed with HTTP ${response.status}`,
    );
    error.cloudflareCodes = payload.errors?.map(({ code }) => code) ?? [];
    throw error;
  }
  return payload.result;
}

async function ensureWorkersSubdomain(accountId, requestedSubdomain) {
  const endpoint = `/accounts/${accountId}/workers/subdomain`;
  try {
    const result = await cloudflareRequest(endpoint);
    return result.subdomain;
  } catch (error) {
    if (!error.cloudflareCodes?.includes(10007)) throw error;
  }

  if (!requestedSubdomain) {
    throw new Error(
      "The account has no workers.dev subdomain. Set CLOUDFLARE_WORKERS_SUBDOMAIN for the first deployment.",
    );
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(requestedSubdomain)) {
    throw new Error("CLOUDFLARE_WORKERS_SUBDOMAIN is not a valid DNS label");
  }
  const result = await cloudflareRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify({ subdomain: requestedSubdomain }),
  });
  return result.subdomain;
}

function listD1Databases() {
  return parseWranglerJson(runWrangler(["d1", "list", "--json"]), "d1 list");
}

function ensureD1Database(databaseName, location) {
  let database = listD1Databases().find(({ name }) => name === databaseName);
  if (!database) {
    runWrangler(["d1", "create", databaseName, "--location", location]);
    database = listD1Databases().find(({ name }) => name === databaseName);
  }
  const databaseId = database?.uuid ?? database?.id;
  if (!databaseId) {
    throw new Error(`D1 database ${databaseName} was not found after provisioning`);
  }
  return databaseId;
}

function listPagesProjects() {
  return parseWranglerJson(
    runWrangler(["pages", "project", "list", "--json"]),
    "pages project list",
  );
}

function ensurePagesProject(projectName) {
  let project = listPagesProjects().find(
    (candidate) => candidate["Project Name"] === projectName,
  );
  if (!project) {
    runWrangler([
      "pages",
      "project",
      "create",
      projectName,
      "--production-branch",
      "main",
    ]);
    project = listPagesProjects().find(
      (candidate) => candidate["Project Name"] === projectName,
    );
  }
  if (!project) throw new Error(`Pages project ${projectName} was not found`);
  const domain = String(project["Project Domains"] ?? "")
    .split(",")[0]
    .trim();
  if (!domain) throw new Error(`Pages project ${projectName} has no public domain`);
  return domain;
}

function writeGithubOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
  );
}

export async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!accountId || !process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required");
  }

  const repositoryRoot = process.cwd();
  const apiConfigPath = path.resolve(
    repositoryRoot,
    process.env.API_WRANGLER_CONFIG ?? "apps/api/wrangler.jsonc",
  );
  const storefrontConfigPath = path.resolve(
    repositoryRoot,
    process.env.STOREFRONT_WRANGLER_CONFIG ?? "apps/storefront/wrangler.jsonc",
  );
  const deployConfigPath = path.resolve(
    repositoryRoot,
    process.env.API_DEPLOY_CONFIG ?? "apps/api/wrangler.deploy.jsonc",
  );
  const apiSource = readFileSync(apiConfigPath, "utf8");
  const storefrontSource = readFileSync(storefrontConfigPath, "utf8");
  const apiWorkerName = extractJsonStringProperty(apiSource, "name");
  const storefrontWorkerName = extractJsonStringProperty(storefrontSource, "name");
  const databaseName = extractJsonStringProperty(apiSource, "database_name");
  const pagesProject =
    process.env.ADMIN_PAGES_PROJECT || apiWorkerName.replace(/-api$/, "-admin");

  const workersSubdomain = await ensureWorkersSubdomain(
    accountId,
    process.env.CLOUDFLARE_WORKERS_SUBDOMAIN,
  );
  const databaseId = ensureD1Database(
    databaseName,
    process.env.D1_LOCATION || "enam",
  );
  const pagesDomain = ensurePagesProject(pagesProject);
  const apiUrl =
    process.env.API_PUBLIC_URL ||
    `https://${apiWorkerName}.${workersSubdomain}.workers.dev`;
  const storeUrl =
    process.env.STORE_PUBLIC_URL ||
    `https://${storefrontWorkerName}.${workersSubdomain}.workers.dev`;
  const adminUrl = process.env.ADMIN_PUBLIC_URL || `https://${pagesDomain}`;

  mkdirSync(path.dirname(deployConfigPath), { recursive: true });
  writeFileSync(
    deployConfigPath,
    buildApiDeployConfig(apiSource, {
      databaseId,
      storeOrigin: storeUrl,
      adminOrigin: adminUrl,
    }),
  );

  const relativeDeployConfig = path
    .relative(repositoryRoot, deployConfigPath)
    .replaceAll(path.sep, "/");
  writeGithubOutputs({
    api_config: relativeDeployConfig,
    api_url: apiUrl,
    store_url: storeUrl,
    admin_url: adminUrl,
    pages_project: pagesProject,
  });
  console.log(`Cloudflare ready: D1=${databaseName}, Pages=${pagesProject}`);
  console.log(`API=${apiUrl}`);
  console.log(`Store=${storeUrl}`);
  console.log(`Admin=${adminUrl}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
