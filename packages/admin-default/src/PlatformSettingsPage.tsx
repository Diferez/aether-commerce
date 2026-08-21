"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, GitBranch, RefreshCw, Rocket, ShieldAlert } from "lucide-react";
import { useAdminConfig } from "./AetherAdminProvider";
import { ConfirmDialog } from "./ConfirmDialog";
import { loadSettings } from "./admin-list-helpers";

type PlatformSettingsSummary = {
  configured: boolean;
  githubOwner: string | null;
  githubRepo: string | null;
  githubWorkflowFile: string | null;
  patConfigured: boolean;
};

type VersionInfo = {
  deployed: { commitSha: string | null; packageVersion: string };
  latest: { commitSha: string | null; packageVersion: string | null };
  credentialsConfigured: boolean;
};

type LoadStatus = "loading" | "ready" | "forbidden" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";
type DeployStatus = "idle" | "confirming" | "deploying" | "triggered" | "error";

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "unknown";
}

async function putPlatformSettings(
  apiBaseUrl: string,
  getToken: () => Promise<string | null>,
  body: Record<string, unknown>
): Promise<{ payload: { success: boolean; data?: PlatformSettingsSummary; error?: { message: string } } | null; ok: boolean }> {
  const token = await getToken().catch(() => null);
  const response = await fetch(`${apiBaseUrl}/api/v1/admin/platform/settings`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { success: boolean; data?: PlatformSettingsSummary; error?: { message: string } };
  return { payload, ok: response.ok };
}

function StatusBadge({ configured, label }: Readonly<{ configured: boolean; label: string }>) {
  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
        <ShieldAlert size={14} aria-hidden />
        Not configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
      <CheckCircle2 size={14} aria-hidden />
      {label}
    </span>
  );
}

function SaveResult({ status, error }: Readonly<{ status: SaveStatus; error: string | null }>) {
  if (status === "saved") return <span className="text-sm text-teal-700">Saved.</span>;
  if (status === "error") return <span className="text-sm text-red-700">{error}</span>;
  return null;
}

function GitHubSettingsForm({
  summary,
  apiBaseUrl,
  onSaved
}: Readonly<{ summary: PlatformSettingsSummary; apiBaseUrl: string; onSaved: (next: PlatformSettingsSummary) => void }>) {
  const [githubOwner, setGithubOwner] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubWorkflowFile, setGithubWorkflowFile] = useState("");
  const [githubPat, setGithubPat] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();
  const hasInput = Boolean(githubOwner.trim() || githubRepo.trim() || githubWorkflowFile.trim() || githubPat.trim());

  async function save() {
    if (!hasInput) return;
    setStatus("saving");
    setError(null);
    const { payload, ok } = await putPlatformSettings(apiBaseUrl, getToken, {
      ...(githubOwner.trim() ? { githubOwner: githubOwner.trim() } : {}),
      ...(githubRepo.trim() ? { githubRepo: githubRepo.trim() } : {}),
      ...(githubWorkflowFile.trim() ? { githubWorkflowFile: githubWorkflowFile.trim() } : {}),
      ...(githubPat.trim() ? { githubPat: githubPat.trim() } : {})
    }).catch(() => ({ payload: null, ok: false }));
    if (!ok || !payload?.success || !payload.data) {
      setError(payload?.error?.message ?? "Could not save the deploy settings.");
      setStatus("error");
      return;
    }
    setGithubOwner("");
    setGithubRepo("");
    setGithubWorkflowFile("");
    setGithubPat("");
    setStatus("saved");
    onSaved(payload.data);
  }

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">GitHub deploy credentials</h3>
        <StatusBadge configured={summary.configured} label="Configured" />
      </div>
      <p className="text-xs text-zinc-500">
        The PAT needs <code>actions:write</code> (to trigger the update workflow) and <code>read:packages</code> (to look up the latest published
        version). It is encrypted at rest and never shown again after saving.
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Repository owner</span>
        <input
          type="text"
          autoComplete="off"
          value={githubOwner}
          onChange={(event) => setGithubOwner(event.target.value)}
          placeholder={summary.githubOwner ?? "your-github-org-or-user"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Repository name</span>
        <input
          type="text"
          autoComplete="off"
          value={githubRepo}
          onChange={(event) => setGithubRepo(event.target.value)}
          placeholder={summary.githubRepo ?? "your-repo"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Update workflow file</span>
        <input
          type="text"
          autoComplete="off"
          value={githubWorkflowFile}
          onChange={(event) => setGithubWorkflowFile(event.target.value)}
          placeholder={summary.githubWorkflowFile ?? "aether-update.yml"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Personal access token</span>
        <input
          type="password"
          autoComplete="off"
          value={githubPat}
          onChange={(event) => setGithubPat(event.target.value)}
          placeholder={summary.patConfigured ? "•••• leave blank to keep current" : "ghp_..."}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving" || !hasInput}
          className="focus-ring min-h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        <SaveResult status={status} error={error} />
      </div>
    </div>
  );
}

function VersionStatusMessage({ version, upToDate }: Readonly<{ version: VersionInfo; upToDate: boolean }>) {
  if (!version.credentialsConfigured) {
    return <p className="text-xs text-amber-700">Save GitHub deploy credentials above to compare against the latest commit.</p>;
  }
  if (upToDate) {
    return <p className="text-xs text-teal-700">Up to date.</p>;
  }
  return <p className="text-xs text-amber-700">A newer commit is available on main.</p>;
}

function VersionCard({
  version,
  onRefresh,
  refreshing,
  onRequestDeploy,
  deployStatus
}: Readonly<{
  version: VersionInfo | null;
  onRefresh: () => void;
  refreshing: boolean;
  onRequestDeploy: () => void;
  deployStatus: DeployStatus;
}>) {
  if (!version) {
    return <p className="p-4 text-sm text-zinc-500">Loading version info...</p>;
  }

  const upToDate = version.deployed.commitSha !== null && version.deployed.commitSha === version.latest.commitSha;
  const canDeploy = version.credentialsConfigured && deployStatus !== "deploying";

  return (
    <div className="grid gap-4 rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <GitBranch size={16} aria-hidden />
          Version
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="focus-ring inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs font-semibold text-zinc-700 disabled:opacity-50"
        >
          <RefreshCw size={12} aria-hidden className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Deployed</p>
          <p className="font-mono">{shortSha(version.deployed.commitSha)}</p>
          <p className="text-zinc-500">@aether-commerce/api-worker {version.deployed.packageVersion}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Latest on main</p>
          <p className="font-mono">{version.credentialsConfigured ? shortSha(version.latest.commitSha) : "unknown"}</p>
          <p className="text-zinc-500">@aether-commerce/api-worker {version.latest.packageVersion ?? "unknown"}</p>
        </div>
      </div>
      <VersionStatusMessage version={version} upToDate={upToDate} />
      <div>
        <button
          type="button"
          onClick={onRequestDeploy}
          disabled={!canDeploy}
          className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          <Rocket size={16} aria-hidden />
          {deployStatus === "deploying" ? "Triggering..." : "Check for updates"}
        </button>
        {deployStatus === "triggered" ? (
          <p className="mt-2 text-xs text-teal-700">Update workflow triggered. It will open a pull request when changes are available.</p>
        ) : null}
        {deployStatus === "error" ? <p className="mt-2 text-xs text-red-700">Could not trigger the deploy. Check the credentials above.</p> : null}
      </div>
    </div>
  );
}

function PlatformSettingsBody({
  status,
  summary,
  version,
  apiBaseUrl,
  refreshingVersion,
  deployStatus,
  onSummarySaved,
  onRefreshVersion,
  onRequestDeploy
}: Readonly<{
  status: LoadStatus;
  summary: PlatformSettingsSummary | null;
  version: VersionInfo | null;
  apiBaseUrl: string;
  refreshingVersion: boolean;
  deployStatus: DeployStatus;
  onSummarySaved: (next: PlatformSettingsSummary) => void;
  onRefreshVersion: () => void;
  onRequestDeploy: () => void;
}>) {
  if (status === "forbidden") {
    return <p className="p-4 text-sm text-zinc-500">Your role does not have the platform.deploy permission.</p>;
  }
  if (status === "error") {
    return <p className="p-4 text-sm text-zinc-500">Could not load platform settings.</p>;
  }
  if (status === "loading" || !summary) {
    return <p className="p-4 text-sm text-zinc-500">Loading...</p>;
  }
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      <GitHubSettingsForm summary={summary} apiBaseUrl={apiBaseUrl} onSaved={onSummarySaved} />
      <VersionCard version={version} onRefresh={onRefreshVersion} refreshing={refreshingVersion} onRequestDeploy={onRequestDeploy} deployStatus={deployStatus} />
    </div>
  );
}

export function PlatformSettingsPage() {
  const { apiBaseUrl } = useAdminConfig();
  const [summary, setSummary] = useState<PlatformSettingsSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [refreshingVersion, setRefreshingVersion] = useState(false);
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const { isLoaded, getToken } = useAuth();

  async function loadSummary() {
    setStatus("loading");
    const token = await getToken().catch(() => null);
    await loadSettings<PlatformSettingsSummary>(
      `${apiBaseUrl}/api/v1/admin/platform/settings`,
      token ? { Authorization: `Bearer ${token}` } : {},
      () => setStatus("forbidden"),
      (data) => {
        setSummary(data);
        setStatus("ready");
      },
      () => setStatus("error")
    );
  }

  async function loadVersion() {
    setRefreshingVersion(true);
    const token = await getToken().catch(() => null);
    await loadSettings<VersionInfo>(
      `${apiBaseUrl}/api/v1/admin/platform/version`,
      token ? { Authorization: `Bearer ${token}` } : {},
      () => {},
      (data) => setVersion(data),
      () => {}
    );
    setRefreshingVersion(false);
  }

  useEffect(() => {
    if (!isLoaded) return;
    void loadSummary();
    void loadVersion();
  }, [isLoaded]);

  async function triggerDeploy() {
    setDeployStatus("deploying");
    const token = await getToken().catch(() => null);
    const response = await fetch(`${apiBaseUrl}/api/v1/admin/platform/deploy`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { success: boolean } | null;
    if (!response?.ok || !payload?.success) {
      setDeployStatus("error");
      return;
    }
    setDeployStatus("triggered");
  }

  return (
    <section id="platform-settings" className="mt-6 rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Rocket size={18} aria-hidden />
          Platform
        </h2>
        <p className="text-sm text-zinc-500">Check the deployed version and ask GitHub to prepare an Aether update pull request.</p>
      </div>
      <PlatformSettingsBody
        status={status}
        summary={summary}
        version={version}
        apiBaseUrl={apiBaseUrl}
        refreshingVersion={refreshingVersion}
        deployStatus={deployStatus}
        onSummarySaved={(next) => {
          setSummary(next);
          void loadVersion();
        }}
        onRefreshVersion={() => void loadVersion()}
        onRequestDeploy={() => setDeployStatus("confirming")}
      />
      <ConfirmDialog
        open={deployStatus === "confirming"}
        title="Check for Aether updates?"
        description="GitHub will update the Aether packages, synchronize migrations, validate the store and open a pull request when changes exist."
        confirmLabel="Check for updates"
        tone="default"
        onConfirm={() => void triggerDeploy()}
        onCancel={() => setDeployStatus("idle")}
      />
    </section>
  );
}
