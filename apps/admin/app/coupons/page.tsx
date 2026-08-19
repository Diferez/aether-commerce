"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/react";
import { TicketPercent } from "lucide-react";
import { RequireAdminAuth } from "../../components/RequireAdminAuth";
import { apiBaseUrl } from "../../components/config";
import { PageHeader } from "../../components/PageHeader";
import { DataTable, type Column } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { StatusBadge } from "../../components/StatusBadge";
import { useAdminLanguage } from "../../components/AdminLanguageProvider";

type CouponType = "percentage" | "fixed";

type CouponRow = {
  code: string;
  type: CouponType;
  value: number;
  active: number;
  minimum_subtotal: number;
};

type FormState = { code: string; type: CouponType; value: string; minimumSubtotal: string };
const emptyForm: FormState = { code: "", type: "percentage", value: "", minimumSubtotal: "0" };

function formatValue(row: CouponRow) {
  return row.type === "percentage" ? `${row.value}%` : `$${(row.value / 100).toFixed(2)}`;
}

export default function CouponsPage() {
  const { getToken } = useAuth();
  const { t } = useAdminLanguage();
  const [rows, setRows] = useState<CouponRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const authHeader = useCallback(async () => {
    const token = await getToken().catch(() => null);
    return token ? { authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/coupons`, { headers: await authHeader() });
      const payload = (await response.json()) as { success: boolean; data?: CouponRow[] };
      if (!payload.success || !payload.data) {
        setStatus("error");
        return;
      }
      setRows(payload.data);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [authHeader]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCoupon(event: React.FormEvent) {
    event.preventDefault();
    const value = Number.parseInt(form.value, 10);
    const minimumSubtotal = Number.parseInt(form.minimumSubtotal || "0", 10);
    if (form.code.trim().length < 3 || !Number.isFinite(value) || value <= 0 || !Number.isFinite(minimumSubtotal) || minimumSubtotal < 0) {
      setFormError(t.couponsPage.formInvalid);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/coupons`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ code: form.code.trim(), type: form.type, value, minimumSubtotal })
      });
      const payload = (await response.json()) as { success: boolean };
      if (!payload.success) {
        setFormError(t.couponsPage.formFailed);
        return;
      }
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch {
      setFormError(t.couponsPage.formFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(row: CouponRow) {
    setPendingCode(row.code);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/admin/coupons/${encodeURIComponent(row.code)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ active: row.active !== 1 })
      });
      const payload = (await response.json()) as { success: boolean };
      if (payload.success) {
        setRows((current) => current.map((item) => (item.code === row.code ? { ...item, active: row.active === 1 ? 0 : 1 } : item)));
      }
    } finally {
      setPendingCode(null);
    }
  }

  const columns: Column<CouponRow>[] = [
    { key: "code", header: t.couponsPage.colCode, render: (row) => <span className="font-mono font-semibold text-ink">{row.code}</span> },
    {
      key: "type",
      header: t.couponsPage.colType,
      render: (row) => (row.type === "percentage" ? t.couponsPage.typePercentage : t.couponsPage.typeFixed)
    },
    { key: "value", header: t.couponsPage.colValue, render: (row) => <span className="tabular-nums">{formatValue(row)}</span> },
    {
      key: "minimumSubtotal",
      header: t.couponsPage.colMinimumSubtotal,
      hideBelow: "sm",
      render: (row) => <span className="tabular-nums">${(row.minimum_subtotal / 100).toFixed(2)}</span>
    },
    {
      key: "status",
      header: t.couponsPage.colStatus,
      render: (row) => (
        <StatusBadge tone={row.active === 1 ? "success" : "archived"}>
          {row.active === 1 ? t.couponsPage.statusActive : t.couponsPage.statusInactive}
        </StatusBadge>
      )
    },
    {
      key: "actions",
      header: t.couponsPage.colActions,
      align: "end",
      render: (row) => (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={pendingCode === row.code}
            onClick={() => void toggleActive(row)}
            className="focus-ring min-h-8 rounded-md border border-border-strong px-2.5 text-xs font-semibold text-ink hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {row.active === 1 ? t.couponsPage.deactivate : t.couponsPage.reactivate}
          </button>
        </div>
      )
    }
  ];

  return (
    <RequireAdminAuth>
      <main id="main-content" className="admin-shell py-8">
        <PageHeader
          title={t.couponsPage.title}
          description={t.couponsPage.description}
          primaryAction={
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="focus-ring min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90"
            >
              {showForm ? t.common.cancel : t.couponsPage.newCoupon}
            </button>
          }
        />

        {showForm ? (
          <form
            onSubmit={(event) => void createCoupon(event)}
            className="mb-6 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-4"
          >
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-muted">{t.couponsPage.colCode}</span>
              <input
                value={form.code}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                maxLength={32}
                required
                className="focus-ring min-h-10 rounded-md border border-border-strong bg-surface px-3 font-mono text-ink"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-muted">{t.couponsPage.colType}</span>
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as CouponType }))}
                className="focus-ring min-h-10 rounded-md border border-border-strong bg-surface px-3 text-ink"
              >
                <option value="percentage">{t.couponsPage.typePercentage}</option>
                <option value="fixed">{t.couponsPage.typeFixed}</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-muted">
                {form.type === "percentage" ? t.couponsPage.valuePercentHint : t.couponsPage.valueCentsHint}
              </span>
              <input
                type="number"
                min={1}
                value={form.value}
                onChange={(event) => setForm((current) => ({ ...current, value: event.target.value }))}
                required
                className="focus-ring min-h-10 rounded-md border border-border-strong bg-surface px-3 text-ink"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-ink-muted">{t.couponsPage.minimumSubtotalCentsHint}</span>
              <input
                type="number"
                min={0}
                value={form.minimumSubtotal}
                onChange={(event) => setForm((current) => ({ ...current, minimumSubtotal: event.target.value }))}
                className="focus-ring min-h-10 rounded-md border border-border-strong bg-surface px-3 text-ink"
              />
            </label>
            {formError ? <p className="text-sm text-danger sm:col-span-4">{formError}</p> : null}
            <div className="sm:col-span-4">
              <button
                type="submit"
                disabled={submitting}
                className="focus-ring min-h-10 rounded-md bg-accent px-4 text-sm font-semibold text-white hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t.common.working : t.common.save}
              </button>
            </div>
          </form>
        ) : null}

        <DataTable<CouponRow>
          columns={columns}
          rows={rows}
          status={status}
          getRowId={(row) => row.code}
          errorState={<ErrorState title={t.couponsPage.couldNotLoad} />}
          emptyState={<EmptyState icon={TicketPercent} title={t.couponsPage.noCoupons} description={t.couponsPage.noCouponsDescription} />}
        />
      </main>
    </RequireAdminAuth>
  );
}
