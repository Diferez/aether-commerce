"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminConfig } from "./AetherAdminProvider";

// Internal plumbing shared across the admin business-list pages (and
// AdminDashboard's CSV export) - not part of the package's public
// component API, so intentionally not re-exported from index.ts. Each
// page originally carried its own copy of this exact logic; centralizing
// it here is what SonarCloud's new-code duplication gate flagged as
// needed once four near-identical list pages existed side by side.

// Every list page's header subtitle: "{count} things" once the total is
// known, a loading fallback while it's still null.
export function countSubtitle(total: number | null, singular: string, plural: string, fallback: string): string {
  if (total === null) return fallback;
  return (total === 1 ? singular : plural).replace("{count}", String(total));
}

// The URL-filter reducer every list page uses: update one field, and
// reset pagination to page 1 unless the field being changed is the page
// number itself.
export function nextFilterState<F extends { page: number }>(current: F, key: keyof F, value: unknown): F {
  return { ...current, [key]: value, page: key === "page" ? (value as number) : 1 };
}

// The fetch/parse/dispatch shape every paginated list page follows.
// Callers still own building the URL and headers (those differ per
// endpoint) and still own their own "loading" state transition before
// calling this.
export async function loadList<T>(
  url: string,
  headers: Record<string, string>,
  onSuccess: (data: T) => void,
  onError: () => void
): Promise<void> {
  try {
    const response = await fetch(url, { headers });
    const payload = (await response.json()) as { success: boolean; data?: T };
    if (!payload.success || !payload.data) {
      onError();
      return;
    }
    onSuccess(payload.data);
  } catch {
    onError();
  }
}

// The fetch/403-check/parse/dispatch shape a single-resource settings
// panel follows (CheckoutProviderSettings, IntegrationSecretsSettings):
// like loadList() but for one object instead of a paginated collection,
// and with its own "forbidden" outcome for a 403 (a role without
// settings.manage), which loadList()'s callers don't need.
export async function loadSettings<T>(
  url: string,
  headers: Record<string, string>,
  onForbidden: () => void,
  onSuccess: (data: T) => void,
  onError: () => void
): Promise<void> {
  try {
    const response = await fetch(url, { headers });
    if (response.status === 403) {
      onForbidden();
      return;
    }
    const payload = (await response.json()) as { success: boolean; data?: T };
    if (!payload.success || !payload.data) {
      onError();
      return;
    }
    onSuccess(payload.data);
  } catch {
    onError();
  }
}

// The (onSuccess, onError) pair loadList() takes, built from a page's own
// setResult/setStatus - shared because the pair itself is identical
// boilerplate across every list page that has no extra per-row state to
// reset (contrast ProductsListPage, which also clears its selection and
// so writes this out by hand instead of using the factory).
export function listResultHandlers<T>(
  setResult: (data: T) => void,
  setStatus: (status: "ready" | "error") => void
): [(data: T) => void, () => void] {
  return [
    (data: T) => {
      setResult(data);
      setStatus("ready");
    },
    () => setStatus("error")
  ];
}

// The full state-and-wiring shape every simple business-list page follows
// (search + a handful of URL-driven filters, one paginated fetch, a
// header count subtitle) - state declarations, the load callback,
// its useEffect, and the updateFilter/submitSearch pair were an
// identical block across every page that has no extra per-row state to
// manage on filter change (contrast ProductsListPage, which also clears
// its row-selection set - it calls updateFilter's setter itself instead
// of using this hook's returned one, to layer that extra reset in).
export function useAdminList<F extends { search: string; page: number }, T>(
  readFilters: () => F,
  endpoint: string,
  buildParams: (filters: F) => URLSearchParams,
  getToken: () => Promise<string | null>
) {
  const { apiBaseUrl } = useAdminConfig();
  const [filters, setFilters] = useState<F>(readFilters);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [result, setResult] = useState<T | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    const params = buildParams(filters);
    window.history.replaceState(null, "", `?${params.toString()}`);
    const token = await getToken().catch(() => null);
    await loadList<T>(
      `${apiBaseUrl}${endpoint}?${params.toString()}`,
      token ? { authorization: `Bearer ${token}` } : {},
      ...listResultHandlers(setResult, setStatus)
    );
  }, [filters, apiBaseUrl, endpoint, buildParams, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof F>(key: K, value: F[K]) {
    setFilters((current) => nextFilterState(current, key, value));
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    updateFilter("search", searchInput as F["search"]);
  }

  return { filters, setFilters, searchInput, setSearchInput, result, status, updateFilter, submitSearch, load };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Shared by OrdersListPage's toolbar action and AdminDashboard's - both
// trigger the exact same admin orders CSV export.
export async function exportOrdersCsv(apiBaseUrl: string, getToken: () => Promise<string | null>): Promise<void> {
  const token = await getToken().catch(() => null);
  const response = await fetch(`${apiBaseUrl}/api/v1/admin/export/orders`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) return;
  const blob = await response.blob();
  downloadBlob(blob, "orders-export.csv");
}
