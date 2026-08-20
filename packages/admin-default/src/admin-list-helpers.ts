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
