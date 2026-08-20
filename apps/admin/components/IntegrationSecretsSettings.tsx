"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, Plug, ShieldAlert } from "lucide-react";
import { apiBaseUrl } from "./config";

type ApiKeyCredentialsSummary = { configured: boolean; apiKeyPreview: string | null };
type CloudinaryCredentialsSummary = {
  configured: boolean;
  cloudName: string | null;
  apiKeyPreview: string | null;
  secretConfigured: boolean;
};

type SettingsSummary = {
  resend: ApiKeyCredentialsSummary;
  gemini: ApiKeyCredentialsSummary;
  cloudinary: CloudinaryCredentialsSummary;
};

type LoadStatus = "loading" | "ready" | "forbidden" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

async function putIntegrationSettings(
  getToken: () => Promise<string | null>,
  body: Record<string, unknown>
): Promise<{ payload: { success: boolean; data?: SettingsSummary; error?: { message: string } } | null; ok: boolean }> {
  const token = await getToken().catch(() => null);
  const response = await fetch(`${apiBaseUrl}/api/v1/admin/integration-settings`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = (await response.json()) as { success: boolean; data?: SettingsSummary; error?: { message: string } };
  return { payload, ok: response.ok };
}

function StatusBadge({ configured, preview }: Readonly<{ configured: boolean; preview: string | null }>) {
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
      Configured {preview ? `(${preview})` : ""}
    </span>
  );
}

function SaveResult({ status, error }: Readonly<{ status: SaveStatus; error: string | null }>) {
  if (status === "saved") return <span className="text-sm text-teal-700">Saved.</span>;
  if (status === "error") return <span className="text-sm text-red-700">{error}</span>;
  return null;
}

// Resend and Gemini are both a single { apiKey } credential - one shared
// form covers both rather than two near-identical components (each with
// its own field/status/error state) diverging only in label, placeholder,
// and which field of PUT /admin/integration-settings' body they touch.
function ApiKeyForm({
  field,
  title,
  placeholder,
  helpText,
  summary,
  onSaved
}: Readonly<{
  field: "resend" | "gemini";
  title: string;
  placeholder: string;
  helpText?: string;
  summary: ApiKeyCredentialsSummary;
  onSaved: (next: SettingsSummary) => void;
}>) {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  async function save() {
    if (!apiKey.trim()) return;
    setStatus("saving");
    setError(null);
    const { payload, ok } = await putIntegrationSettings(getToken, { [field]: { apiKey: apiKey.trim() } }).catch(() => ({ payload: null, ok: false }));
    if (!ok || !payload?.success || !payload.data) {
      setError(payload?.error?.message ?? `Could not save the ${title} API key.`);
      setStatus("error");
      return;
    }
    setApiKey("");
    setStatus("saved");
    onSaved(payload.data);
  }

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <StatusBadge configured={summary.configured} preview={summary.apiKeyPreview} />
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">API key</span>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={summary.configured ? "•••• leave blank to keep current" : placeholder}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      {helpText ? <p className="text-xs text-zinc-500">{helpText}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving" || !apiKey.trim()}
          className="focus-ring min-h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        <SaveResult status={status} error={error} />
      </div>
    </div>
  );
}

function CloudinaryForm({ summary, onSaved }: Readonly<{ summary: CloudinaryCredentialsSummary; onSaved: (next: SettingsSummary) => void }>) {
  const [cloudName, setCloudName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();
  const hasInput = Boolean(cloudName.trim() || apiKey.trim() || apiSecret.trim());

  async function save() {
    if (!hasInput) return;
    setStatus("saving");
    setError(null);
    const { payload, ok } = await putIntegrationSettings(getToken, {
      cloudinary: {
        ...(cloudName.trim() ? { cloudName: cloudName.trim() } : {}),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(apiSecret.trim() ? { apiSecret: apiSecret.trim() } : {})
      }
    }).catch(() => ({ payload: null, ok: false }));
    if (!ok || !payload?.success || !payload.data) {
      setError(payload?.error?.message ?? "Could not save the Cloudinary credentials.");
      setStatus("error");
      return;
    }
    setCloudName("");
    setApiKey("");
    setApiSecret("");
    setStatus("saved");
    onSaved(payload.data);
  }

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Cloudinary (product images)</h3>
        <StatusBadge configured={summary.configured} preview={summary.cloudName} />
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Cloud name</span>
        <input
          type="text"
          autoComplete="off"
          value={cloudName}
          onChange={(event) => setCloudName(event.target.value)}
          placeholder={summary.cloudName ?? "your-cloud-name"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">API key</span>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={summary.apiKeyPreview ? "•••• leave blank to keep current" : "Enter API key"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">API secret</span>
        <input
          type="password"
          autoComplete="off"
          value={apiSecret}
          onChange={(event) => setApiSecret(event.target.value)}
          placeholder={summary.secretConfigured ? "•••• leave blank to keep current" : "Enter API secret"}
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

function IntegrationSettingsBody({ status, summary, onSaved }: Readonly<{ status: LoadStatus; summary: SettingsSummary | null; onSaved: (next: SettingsSummary) => void }>) {
  if (status === "forbidden") {
    return <p className="p-4 text-sm text-zinc-500">Your role does not have the settings.manage permission.</p>;
  }
  if (status === "error") {
    return <p className="p-4 text-sm text-zinc-500">Could not load integration settings.</p>;
  }
  if (status === "loading" || !summary) {
    return <p className="p-4 text-sm text-zinc-500">Loading...</p>;
  }
  return (
    <div className="grid gap-4 p-4 md:grid-cols-3">
      <ApiKeyForm field="resend" title="Resend (email)" placeholder="re_..." summary={summary.resend} onSaved={onSaved} />
      <ApiKeyForm
        field="gemini"
        title="Gemini (AI assistants)"
        placeholder="AIza..."
        helpText="Used by both the admin chat assistant and the storefront's own AI assistant."
        summary={summary.gemini}
        onSaved={onSaved}
      />
      <CloudinaryForm summary={summary.cloudinary} onSaved={onSaved} />
    </div>
  );
}

export function IntegrationSecretsSettings() {
  const [summary, setSummary] = useState<SettingsSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const { isLoaded, getToken } = useAuth();

  async function load() {
    setStatus("loading");
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/integration-settings`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (response.status === 403) {
        setStatus("forbidden");
        return;
      }
      const payload = (await response.json()) as { success: boolean; data?: SettingsSummary };
      if (payload.success && payload.data) {
        setSummary(payload.data);
        setStatus("ready");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    void load();
  }, [isLoaded]);

  return (
    <section id="integration-settings" className="mt-6 rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Plug size={18} aria-hidden />
          Integrations
        </h2>
        <p className="text-sm text-zinc-500">
          Configure Resend, Gemini, and Cloudinary. Secrets are encrypted at rest and never shown again after saving.
        </p>
      </div>
      <IntegrationSettingsBody status={status} summary={summary} onSaved={setSummary} />
    </section>
  );
}
