"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { CheckCircle2, CreditCard, ShieldAlert } from "lucide-react";
import { useAdminConfig } from "./AetherAdminProvider";

type ProviderId = "stripe" | "wompi";

type CredentialsSummary = {
  configured: boolean;
  secretKeyPreview: string | null;
  webhookConfigured: boolean;
};

type SettingsSummary = {
  mode: ProviderId;
  stripe: CredentialsSummary;
  wompi: CredentialsSummary;
};

type LoadStatus = "loading" | "ready" | "forbidden" | "error";
type SaveStatus = "idle" | "saving" | "saved" | "error";

const PROVIDER_LABEL: Record<ProviderId, string> = { stripe: "Stripe", wompi: "Wompi" };

function ProviderForm({
  provider,
  summary,
  apiBaseUrl,
  onSaved
}: Readonly<{
  provider: ProviderId;
  summary: CredentialsSummary;
  apiBaseUrl: string;
  onSaved: (next: SettingsSummary) => void;
}>) {
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  async function save() {
    if (!secretKey.trim() && !webhookSecret.trim()) return;
    setStatus("saving");
    setError(null);
    try {
      const token = await getToken().catch(() => null);
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/checkout-settings`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          [provider]: {
            ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
            ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {})
          }
        })
      });
      const payload = (await response.json()) as { success: boolean; data?: SettingsSummary; error?: { message: string } };
      if (!response.ok || !payload.success || !payload.data) {
        setError(payload.error?.message ?? "Could not save credentials.");
        setStatus("error");
        return;
      }
      setSecretKey("");
      setWebhookSecret("");
      setStatus("saved");
      onSaved(payload.data);
    } catch {
      setError("Could not reach the API.");
      setStatus("error");
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{PROVIDER_LABEL[provider]}</h3>
        {summary.configured ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
            <CheckCircle2 size={14} aria-hidden />
            Configured {summary.secretKeyPreview ? `(${summary.secretKeyPreview})` : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
            <ShieldAlert size={14} aria-hidden />
            Not configured
          </span>
        )}
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Secret key</span>
        <input
          type="password"
          autoComplete="off"
          value={secretKey}
          onChange={(event) => setSecretKey(event.target.value)}
          placeholder={summary.configured ? "•••• leave blank to keep current" : "Enter secret key"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-600">Webhook secret</span>
        <input
          type="password"
          autoComplete="off"
          value={webhookSecret}
          onChange={(event) => setWebhookSecret(event.target.value)}
          placeholder={summary.webhookConfigured ? "•••• leave blank to keep current" : "Enter webhook secret"}
          className="focus-ring min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={status === "saving" || (!secretKey.trim() && !webhookSecret.trim())}
          className="focus-ring min-h-10 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        {status === "saved" ? <span className="text-sm text-teal-700">Saved.</span> : null}
        {status === "error" ? <span className="text-sm text-red-700">{error}</span> : null}
      </div>
    </div>
  );
}

function CheckoutSettingsBody(
  status: LoadStatus,
  summary: SettingsSummary | null,
  apiBaseUrl: string,
  modeStatus: SaveStatus,
  onChangeMode: (mode: ProviderId) => void,
  onSaved: (next: SettingsSummary) => void
): ReactNode {
  if (status === "forbidden") {
    return <p className="p-4 text-sm text-zinc-500">Your role does not have the settings.manage permission.</p>;
  }
  if (status === "error") {
    return <p className="p-4 text-sm text-zinc-500">Could not load checkout settings.</p>;
  }
  if (status === "loading" || !summary) {
    return <p className="p-4 text-sm text-zinc-500">Loading...</p>;
  }
  return (
    <div className="grid gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-zinc-700">Active provider:</span>
        {(["stripe", "wompi"] as const).map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => onChangeMode(provider)}
            disabled={modeStatus === "saving" || summary.mode === provider}
            className={`focus-ring min-h-9 rounded-full border px-3 text-sm font-semibold disabled:cursor-not-allowed ${
              summary.mode === provider
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {PROVIDER_LABEL[provider]}
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <ProviderForm provider="stripe" summary={summary.stripe} apiBaseUrl={apiBaseUrl} onSaved={onSaved} />
        <ProviderForm provider="wompi" summary={summary.wompi} apiBaseUrl={apiBaseUrl} onSaved={onSaved} />
      </div>
    </div>
  );
}

export function CheckoutProviderSettings() {
  const { apiBaseUrl } = useAdminConfig();
  const [summary, setSummary] = useState<SettingsSummary | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [modeStatus, setModeStatus] = useState<SaveStatus>("idle");
  const { isLoaded, getToken } = useAuth();

  async function load() {
    setStatus("loading");
    const token = await getToken().catch(() => null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/checkout-settings`, {
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

  async function changeMode(mode: ProviderId) {
    setModeStatus("saving");
    try {
      const token = await getToken().catch(() => null);
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/checkout-settings`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ mode })
      });
      const payload = (await response.json()) as { success: boolean; data?: SettingsSummary };
      if (payload.success && payload.data) {
        setSummary(payload.data);
        setModeStatus("saved");
      } else {
        setModeStatus("error");
      }
    } catch {
      setModeStatus("error");
    }
  }

  return (
    <section id="checkout-settings" className="mt-6 rounded-lg border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CreditCard size={18} aria-hidden />
          Checkout providers
        </h2>
        <p className="text-sm text-zinc-500">
          Configure Stripe and Wompi. Secrets are encrypted at rest and never shown again after saving.
        </p>
      </div>

      {CheckoutSettingsBody(status, summary, apiBaseUrl, modeStatus, (mode) => void changeMode(mode), setSummary)}
    </section>
  );
}
