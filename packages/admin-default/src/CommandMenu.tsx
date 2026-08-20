"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import { Boxes, ClipboardList, CornerDownLeft, Plus, Search, UsersRound } from "lucide-react";
import { getNavGroups } from "./nav-items";
import { useAdminConfig } from "./AetherAdminProvider";
import { useAdminLanguage } from "./AdminLanguageProvider";
import type { AdminDictionary } from "@aether/i18n";

type Option = { id: string; label: string; sublabel?: string; href: string; group: string; icon: typeof Search };

function getQuickActions(t: AdminDictionary): Option[] {
  return [
    { id: "action-new-order", label: t.commandMenu.newWhatsappOrder, href: "/orders/new/", group: t.commandMenu.actions, icon: Plus },
    { id: "action-new-product", label: t.commandMenu.newProduct, href: "/products/new/", group: t.commandMenu.actions, icon: Plus }
  ];
}

function getNavOptions(t: AdminDictionary): Option[] {
  return getNavGroups(t)
    .flatMap((group) => group.items)
    .map((item) => ({
      id: `nav-${item.href}`,
      label: item.label,
      href: item.href,
      group: t.commandMenu.goTo,
      icon: item.icon
    }));
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function CommandMenu({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const { getToken } = useAuth();
  const { apiBaseUrl } = useAdminConfig();
  const { t } = useAdminLanguage();
  const quickActions = useMemo(() => getQuickActions(t), [t]);
  const navOptions = useMemo(() => getNavOptions(t), [t]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Option[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSearchResults([]);
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
  }, [open]);

  useEffect(() => {
    if (!open || debouncedQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    void (async () => {
      const token = await getToken().catch(() => null);
      const headers = token ? { authorization: `Bearer ${token}` } : {};
      const encoded = encodeURIComponent(debouncedQuery.trim());
      const [productsRes, ordersRes, customersRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/admin/products?search=${encoded}&pageSize=5`, { headers }).catch(() => null),
        fetch(`${apiBaseUrl}/api/v1/admin/orders?search=${encoded}&pageSize=5`, { headers }).catch(() => null),
        fetch(`${apiBaseUrl}/api/v1/admin/users?search=${encoded}&pageSize=5`, { headers }).catch(() => null)
      ]);
      if (cancelled) return;

      const [productsPayload, ordersPayload, customersPayload] = await Promise.all([
        productsRes?.ok
          ? (productsRes.json() as Promise<{ success: boolean; data?: { data: Array<{ id: string; name: string; sku: string }> } }>)
          : null,
        ordersRes?.ok
          ? (ordersRes.json() as Promise<{ success: boolean; data?: { data: Array<{ id: string; number: string; email: string }> } }>)
          : null,
        customersRes?.ok
          ? (customersRes.json() as Promise<{ success: boolean; data?: { data: Array<{ id: string; name: string | null; email: string }> } }>)
          : null
      ]);
      if (cancelled) return;

      const options: Option[] = [
        ...(productsPayload?.success ? productsPayload.data?.data ?? [] : []).map((product) => ({
          id: `product-${product.id}`,
          label: product.name,
          sublabel: `SKU ${product.sku}`,
          href: `/products/edit/?id=${encodeURIComponent(product.id)}`,
          group: t.commandMenu.products,
          icon: Boxes
        })),
        ...(ordersPayload?.success ? ordersPayload.data?.data ?? [] : []).map((order) => ({
          id: `order-${order.id}`,
          label: order.number,
          sublabel: order.email,
          href: `/orders/detail/?id=${encodeURIComponent(order.id)}`,
          group: t.commandMenu.orders,
          icon: ClipboardList
        })),
        ...(customersPayload?.success ? customersPayload.data?.data ?? [] : []).map((customer) => ({
          id: `customer-${customer.id}`,
          label: customer.name ?? customer.email,
          ...(customer.name ? { sublabel: customer.email } : {}),
          href: `/customers/detail/?id=${encodeURIComponent(customer.id)}`,
          group: t.commandMenu.customers,
          icon: UsersRound
        }))
      ];
      setSearchResults(options);
      setSearching(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, getToken, t, apiBaseUrl]);

  const options = useMemo<Option[]>(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length >= 2) {
      const filteredStatic = [...navOptions, ...quickActions].filter((option) => option.label.toLowerCase().includes(trimmed));
      return [...filteredStatic, ...searchResults];
    }
    const filteredStatic = [...navOptions, ...quickActions].filter(
      (option) => trimmed.length === 0 || option.label.toLowerCase().includes(trimmed)
    );
    return filteredStatic;
  }, [query, searchResults, navOptions, quickActions]);

  useEffect(() => {
    setActiveIndex(0);
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, options.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        const selected = options[activeIndex];
        if (selected) {
          event.preventDefault();
          window.location.href = selected.href;
        }
        return;
      }
      // Every option below the input is tabIndex={-1} (keyboard selection
      // moves through them via the Arrow handlers above instead), so the
      // input is the only real tab stop - without this, Tab would escape
      // the dialog to whatever sits behind it in the DOM.
      if (event.key === "Tab") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, options, activeIndex, onClose]);

  if (!open) return null;

  let groupCursor = "";
  let flatIndex = -1;

  // The backdrop's onClick is a mouse-only convenience dismiss - keyboard
  // users already have an equivalent via the document-level Escape handler
  // above, and the ARIA dialog role on the panel below is the standard,
  // correct pattern (WAI-ARIA dialog authoring practice), not a substitute
  // for the native <dialog> element Sonar suggests, which has different
  // imperative show/close and focus-trap semantics this component doesn't
  // use. The panel's own onClick only stops propagation to the backdrop -
  // it performs no action a keyboard user would need a key handler for.
  return (
    <div // NOSONAR - see comment above
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh]"
      role="presentation"
      onClick={onClose}
    >
      <div // NOSONAR - see comment above
        role="dialog"
        aria-modal="true"
        aria-label={t.commandMenu.dialogLabel}
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-elevate-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search size={16} aria-hidden className="text-ink-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.commandMenu.searchPlaceholder}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-menu-listbox"
            aria-activedescendant={options[activeIndex]?.id}
            className="min-h-12 w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
        </div>
        <ul id="command-menu-listbox" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
          {options.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ink-muted">
              {searching ? t.commandMenu.searching : t.commandMenu.noMatches}
            </li>
          ) : (
            options.map((option) => {
              flatIndex += 1;
              const showGroupHeader = option.group !== groupCursor;
              groupCursor = option.group;
              const isActiveOption = flatIndex === activeIndex;
              return (
                <li key={option.id}>
                  {showGroupHeader ? (
                    <p className="px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle first:pt-1">{option.group}</p>
                  ) : null}
                  <a
                    id={option.id}
                    role="option"
                    aria-selected={isActiveOption}
                    href={option.href}
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    className={`flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm ${
                      isActiveOption ? "bg-accent-soft text-accent" : "text-ink hover:bg-surface-hover"
                    }`}
                  >
                    <option.icon size={15} aria-hidden className="shrink-0" />
                    <span className="truncate">{option.label}</span>
                    {option.sublabel ? <span className="truncate text-ink-subtle">{option.sublabel}</span> : null}
                    {isActiveOption ? <CornerDownLeft size={13} aria-hidden className="ml-auto shrink-0 text-ink-subtle" /> : null}
                  </a>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
