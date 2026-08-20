"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { clsx } from "clsx";
import { MessageSquareText, Star } from "lucide-react";
import { RequireAdminAuth } from "./RequireAdminAuth";
import { useAdminConfig } from "./AetherAdminProvider";
import { PageHeader } from "./PageHeader";
import { DataTable, type Column } from "./DataTable";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { StatusBadge, type StatusTone } from "./StatusBadge";
import { useAdminLanguage } from "./AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

type ReviewStatus = "pending" | "approved" | "rejected" | "hidden";
type FilterValue = ReviewStatus | "all";

type ReviewRow = {
  id: string;
  status: ReviewStatus;
  rating: number;
  title: string;
  body: string;
  created_at: string;
  product_id: string | null;
  product_name: string | null;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
};

const FILTERS: FilterValue[] = ["pending", "approved", "rejected", "hidden", "all"];
const STATUS_TONE: Record<ReviewStatus, StatusTone> = { pending: "pending", approved: "success", rejected: "error", hidden: "archived" };
// Every action a moderator can take from any status - "pending" is
// deliberately not offered as a target: once a review has been decided,
// sending it back to the unreviewed queue isn't a real workflow here.
const ACTIONS: Array<{ status: ReviewStatus; labelKey: "approve" | "reject" | "hide" }> = [
  { status: "approved", labelKey: "approve" },
  { status: "rejected", labelKey: "reject" },
  { status: "hidden", labelKey: "hide" }
];

function filterLabel(t: AdminDictionary, filter: FilterValue): string {
  return filter === "all" ? t.reviewsPage.filterAll : t.reviewsPage[`filter${filter.charAt(0).toUpperCase()}${filter.slice(1)}` as keyof AdminDictionary["reviewsPage"]];
}

function statusLabel(t: AdminDictionary, status: ReviewStatus): string {
  return t.reviewsPage[`status${status.charAt(0).toUpperCase()}${status.slice(1)}` as keyof AdminDictionary["reviewsPage"]];
}

function Stars({ rating }: Readonly<{ rating: number }>) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating}/5`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star key={index} size={13} className={index < rating ? "fill-warning text-warning" : "text-border-strong"} aria-hidden />
      ))}
    </span>
  );
}

export function ReviewsPage() {
  const { getToken } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t, locale } = useAdminLanguage();
  const [filter, setFilter] = useState<FilterValue>("pending");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const query = filter === "all" ? "" : `?status=${filter}`;
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/reviews${query}`, { headers: await authHeader() });
      const payload = (await response.json()) as { success: boolean; data?: ReviewRow[] };
      if (!payload.success || !payload.data) {
        setStatus("error");
        return;
      }
      setRows(payload.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [filter, authHeader, apiBaseUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function moderate(id: string, nextStatus: ReviewStatus) {
    setPendingActionId(id);
    setActionError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/reviews/${encodeURIComponent(id)}/moderation`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ status: nextStatus })
      });
      const payload = (await response.json()) as { success: boolean };
      if (!payload.success) {
        setActionError(t.reviewsPage.actionFailed);
        return;
      }
      // A filtered view (anything but "all") drops the row once it no
      // longer matches; "all" just updates its badge in place.
      setRows((current) =>
        filter === "all"
          ? current.map((row) => (row.id === id ? { ...row, status: nextStatus } : row))
          : current.filter((row) => row.id !== id)
      );
    } catch {
      setActionError(t.reviewsPage.actionFailed);
    } finally {
      setPendingActionId(null);
    }
  }

  const columns: Column<ReviewRow>[] = [
    {
      key: "product",
      header: t.reviewsPage.colProduct,
      render: (row) => <span className="font-medium text-ink [overflow-wrap:anywhere]">{row.product_name ?? t.reviewsPage.unknownProduct}</span>
    },
    {
      key: "reviewer",
      header: t.reviewsPage.colReviewer,
      hideBelow: "sm",
      render: (row) => <span className="text-ink-muted [overflow-wrap:anywhere]">{row.user_name || row.user_email || t.reviewsPage.anonymousReviewer}</span>
    },
    { key: "rating", header: t.reviewsPage.colRating, render: (row) => <Stars rating={row.rating} /> },
    {
      key: "review",
      header: t.reviewsPage.colReview,
      render: (row) => (
        <div className="max-w-md">
          <p className="font-medium text-ink [overflow-wrap:anywhere]">{row.title}</p>
          <p className="text-xs text-ink-subtle [overflow-wrap:anywhere]">{row.body}</p>
        </div>
      )
    },
    {
      key: "status",
      header: t.reviewsPage.colStatus,
      render: (row) => <StatusBadge tone={STATUS_TONE[row.status]}>{statusLabel(t, row.status)}</StatusBadge>
    },
    {
      key: "date",
      header: t.reviewsPage.colDate,
      hideBelow: "md",
      render: (row) => <span className="whitespace-nowrap text-xs text-ink-subtle">{new Date(row.created_at.replace(" ", "T") + "Z").toLocaleDateString(locale === "es" ? "es-ES" : "en-US")}</span>
    },
    {
      key: "actions",
      header: t.reviewsPage.colActions,
      align: "end",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {ACTIONS.filter((action) => action.status !== row.status).map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={pendingActionId === row.id}
              onClick={() => void moderate(row.id, action.status)}
              className="focus-ring min-h-8 rounded-md border border-border-strong px-2.5 text-xs font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t.reviewsPage[action.labelKey]}
            </button>
          ))}
        </div>
      )
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader title={t.reviewsPage.title} description={t.reviewsPage.description} />

        <div className="mb-3 flex flex-wrap gap-1.5">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={clsx(
                "focus-ring min-h-9 rounded-full border px-3 text-sm font-semibold",
                filter === value ? "border-accent bg-accent-soft text-accent" : "border-border-strong text-ink-muted hover:bg-surface-hover"
              )}
            >
              {filterLabel(t, value)}
            </button>
          ))}
        </div>

        {actionError ? <p className="mb-3 text-sm text-danger">{actionError}</p> : null}

        <DataTable<ReviewRow>
          columns={columns}
          rows={rows}
          status={status}
          getRowId={(row) => row.id}
          errorState={<ErrorState title={t.reviewsPage.couldNotLoad} />}
          emptyState={<EmptyState icon={MessageSquareText} title={t.reviewsPage.noReviews} description={t.reviewsPage.noReviewsDescription} />}
        />
      </main>
    </RequireAdminAuth>
  );
}
