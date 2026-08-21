import type { PlatformDeployCredentials } from "@aether/api-core";

const GITHUB_API_BASE = "https://api.github.com";

function authHeaders(pat: string): Record<string, string> {
  return {
    authorization: `Bearer ${pat}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "aether-admin-platform-panel"
  };
}

export type RequiredPlatformDeployCredentials = {
  githubOwner: string;
  githubRepo: string;
  githubWorkflowFile: string;
  githubPat: string;
};

/** Narrows the partial, admin-editable credentials to what every call below actually needs - callers check this before doing anything, same "degrade to absent" spirit as the rest of this feature. */
export function requireCompleteCredentials(credentials: PlatformDeployCredentials): RequiredPlatformDeployCredentials | null {
  if (!credentials.githubOwner || !credentials.githubRepo || !credentials.githubWorkflowFile || !credentials.githubPat) return null;
  return {
    githubOwner: credentials.githubOwner,
    githubRepo: credentials.githubRepo,
    githubWorkflowFile: credentials.githubWorkflowFile,
    githubPat: credentials.githubPat
  };
}

/**
 * The most recent commit SHA on the repo's main branch - compared against
 * this Worker's own DEPLOYED_COMMIT_SHA to tell an admin "there's undeployed
 * code" without needing any package version to have actually changed (see
 * the version-comparison design note in the plan: @aether/* packages are
 * rarely re-versioned in practice, so commit SHA is the signal that's
 * actually meaningful day to day).
 */
export async function getLatestCommitSha(credentials: RequiredPlatformDeployCredentials): Promise<string | null> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${credentials.githubOwner}/${credentials.githubRepo}/commits/main`, {
      headers: authHeaders(credentials.githubPat)
    });
    if (!response.ok) return null;
    const payload: { sha?: string } = await response.json();
    return payload.sha ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort lookup of the latest published @aether/api-worker version on
 * the GitHub Packages npm registry. Returns null on any failure (wrong
 * scope on the PAT, org- vs user-owned package endpoint mismatch, package
 * never published yet) rather than throwing - this is a secondary,
 * informational data point (see the plan's version-comparison design note),
 * never something that should block the panel or the deploy button.
 */
export async function getLatestPublishedPackageVersion(
  credentials: RequiredPlatformDeployCredentials,
  packageName = "api-worker",
  packageOwner = credentials.githubOwner
): Promise<string | null> {
  try {
    for (const ownerKind of ["orgs", "users"] as const) {
      const response = await fetch(
        `${GITHUB_API_BASE}/${ownerKind}/${encodeURIComponent(packageOwner)}/packages/npm/${encodeURIComponent(packageName)}/versions?per_page=1`,
        { headers: authHeaders(credentials.githubPat) }
      );
      if (!response.ok) continue;
      const payload: Array<{ name?: string }> = await response.json();
      return payload[0]?.name ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Triggers a real production redeploy via GitHub's workflow_dispatch API. Throws on failure - the caller (the admin route) is responsible for turning that into a clear error response, this never fails silently the way the read-only lookups above do. */
export async function triggerDeployWorkflow(credentials: RequiredPlatformDeployCredentials): Promise<void> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${credentials.githubOwner}/${credentials.githubRepo}/actions/workflows/${encodeURIComponent(credentials.githubWorkflowFile)}/dispatches`,
    {
      method: "POST",
      headers: { ...authHeaders(credentials.githubPat), "content-type": "application/json" },
      body: JSON.stringify({ ref: "main" })
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub workflow_dispatch failed (${response.status}): ${body.slice(0, 200)}`);
  }
}
