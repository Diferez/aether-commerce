"use client";

import { useEffect, useState } from "react";
import { useAuth, UserButton, useUser } from "@clerk/react";
import { ChevronsLeft, ChevronsRight, ExternalLink, Sparkles } from "lucide-react";
import { navGroups } from "./nav-items";
import { ThemeToggle } from "./ThemeToggle";
import { apiBaseUrl, storefrontUrl } from "./config";

function useCurrentPath() {
  // Every nav link is a real <a href> (static export, full page navigation,
  // no client router) so the pathname is stable for the component's whole
  // mounted lifetime once set. Reading window.location straight into a
  // useState initializer (this component's first shipped version) caused a
  // real hydration mismatch: SSR always renders "/" (no window), so the
  // client's first paint must match that before the effect below corrects
  // it - same pattern already used by useOrderIdParam/useProductIdParam for
  // the same static-export reason.
  const [path, setPath] = useState("/");
  useEffect(() => {
    setPath(window.location.pathname);
  }, []);
  return path;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

// Clerk's <UserButton/> only renders the avatar as the real clickable
// trigger (.cl-userButtonTrigger) - the name/role text next to it is our
// own markup, not part of the button, so clicking it did nothing. Forward
// clicks anywhere in the row to the real trigger, unless the click already
// landed on it (which would otherwise open then immediately close the menu).
function openUserMenuUnlessAlreadyOnTrigger(event: React.MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (target.closest(".cl-userButtonTrigger")) return;
  event.currentTarget.querySelector<HTMLButtonElement>(".cl-userButtonTrigger")?.click();
}

function useModuleCounts() {
  const { getToken } = useAuth();
  const [counts, setCounts] = useState<{ pendingOrders: number | null; lowStock: number | null }>({
    pendingOrders: null,
    lowStock: null
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken().catch(() => null);
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const [ordersRes, stockRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/admin/orders?fulfillmentStatus=unfulfilled&pageSize=1`, { headers }).catch(() => null),
        fetch(`${apiBaseUrl}/api/v1/admin/products?stock=low&pageSize=1`, { headers }).catch(() => null)
      ]);
      if (cancelled) return;
      const [ordersPayload, stockPayload] = await Promise.all([
        ordersRes?.ok ? (ordersRes.json() as Promise<{ success: boolean; data?: { pagination: { total: number } } }>) : null,
        stockRes?.ok ? (stockRes.json() as Promise<{ success: boolean; data?: { pagination: { total: number } } }>) : null
      ]);
      if (cancelled) return;
      setCounts({
        pendingOrders: ordersPayload?.success ? (ordersPayload.data?.pagination.total ?? null) : null,
        lowStock: stockPayload?.success ? (stockPayload.data?.pagination.total ?? null) : null
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  return counts;
}

export function AdminSidebar({ collapsed, onToggleCollapsed }: { collapsed: boolean; onToggleCollapsed: () => void }) {
  const pathname = useCurrentPath();
  const counts = useModuleCounts();
  const { user } = useUser();
  const { isSignedIn } = useAuth();
  const isDemo = pathname.startsWith("/demo");
  const role = (user?.publicMetadata as { roles?: string[] } | undefined)?.roles?.[0];

  return (
    <aside
      className="fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-border bg-surface transition-[width] duration-150 lg:flex"
      style={{ width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)" }}
    >
      <div className="flex h-[var(--header-h)] items-center gap-2.5 border-b border-border px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-white">
          <Sparkles size={16} aria-hidden />
        </span>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-ink">Aether</p>
            <p className="truncate text-xs leading-tight text-ink-subtle">Admin console</p>
          </div>
        ) : null}
      </div>

      {/* Small (12px) uppercase text needs real 4.5:1 contrast, not the
          "large text" 3:1 exception - --color-warning measures 4.39:1
          against its own soft background at this size in light mode (just
          under AA; dark mode already passes at 8.5:1). demo-badge-text
          overrides only the light-mode shade, in globals.css next to the
          theme tokens, rather than using Tailwind's dark: variant (unwired
          in this app - theme is toggled via data-theme, not prefers-color-scheme). */}
      {isDemo && !collapsed ? (
        <div className="demo-badge-text mx-3 mt-3 rounded-md bg-warning-soft px-2.5 py-1.5 text-center text-xs font-semibold uppercase tracking-wide">
          Demo
        </div>
      ) : null}

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2.5 py-3">
        {navGroups.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={groupIndex > 0 ? "mt-4" : undefined}>
            {group.label && !collapsed ? (
              <p className="px-2.5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{group.label}</p>
            ) : null}
            <ul className="grid gap-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.countKey ? counts[item.countKey] : null;
                return (
                  <li key={item.href} className="group/nav relative">
                    <a
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? `${item.label}${count ? ` (${count})` : ""}` : undefined}
                      className={`focus-ring relative flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm transition ${
                        active ? "bg-accent-soft font-semibold text-accent" : "font-medium text-ink-muted hover:bg-surface-hover hover:text-ink"
                      } ${collapsed ? "justify-center" : ""}`}
                    >
                      {active ? <span className="absolute -left-2.5 h-5 w-0.5 rounded-full bg-accent" aria-hidden /> : null}
                      <item.icon size={17} aria-hidden className="shrink-0" />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      {!collapsed && count ? (
                        <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white tabular-nums">
                          {count}
                        </span>
                      ) : null}
                    </a>
                    {collapsed ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-surface opacity-0 shadow-elevate-sm transition-opacity group-hover/nav:opacity-100"
                      >
                        {item.label}
                        {count ? ` (${count})` : ""}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border p-2.5">
        <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : "justify-between"} px-1 pb-2`}>
          <ThemeToggle />
          <a
            href={storefrontUrl}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label="Open storefront in a new tab"
            title="Open storefront"
          >
            <ExternalLink size={16} aria-hidden />
          </a>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight size={16} aria-hidden /> : <ChevronsLeft size={16} aria-hidden />}
          </button>
        </div>
        <div
          className={`flex items-center gap-2.5 rounded-md px-1.5 py-1.5 ${collapsed ? "justify-center" : ""} ${isSignedIn ? "cursor-pointer hover:bg-surface-hover" : ""}`}
          onClick={openUserMenuUnlessAlreadyOnTrigger}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-ink [&_.cl-userButtonTrigger]:h-8 [&_.cl-userButtonTrigger]:w-8">
            {isSignedIn ? <UserButton /> : null}
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Account"}</p>
              {role ? <p className="truncate text-xs capitalize text-ink-subtle">{role.replaceAll("_", " ")}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
