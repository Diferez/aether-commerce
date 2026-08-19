import { Activity, BarChart3, Boxes, ClipboardList, History, MessageSquareText, Settings, TicketPercent, UsersRound, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AdminDictionary } from "@aether/i18n";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Read client-side against real data by AdminSidebar - never a fabricated count. */
  countKey?: "pendingOrders" | "lowStock" | "pendingReviews";
};

export type NavGroup = {
  /** null renders no group header - used for single-item groups per the IA spec. */
  label: string | null;
  items: NavItem[];
};

// A function of the active dictionary (not a static const) so nav labels
// follow the admin's language toggle - see AdminLanguageProvider. Ordered
// by real usage priority (Home > Orders > Products > Inventory > Customers
// > Settings > Activity), grouped per the requested IA (Summary /
// Operations / Relationships / System). A group with exactly one item never
// renders its own header - that's Home and Customers today.
export function getNavGroups(t: AdminDictionary): NavGroup[] {
  return [
    { label: null, items: [{ href: "/", label: t.nav.home, icon: BarChart3 }] },
    {
      label: t.nav.operationsGroup,
      items: [
        { href: "/orders/", label: t.nav.orders, icon: ClipboardList, countKey: "pendingOrders" },
        { href: "/products/", label: t.nav.products, icon: Boxes },
        { href: "/inventory/", label: t.nav.inventory, icon: Warehouse, countKey: "lowStock" },
        { href: "/reviews/", label: t.nav.reviews, icon: MessageSquareText, countKey: "pendingReviews" },
        { href: "/coupons/", label: t.nav.coupons, icon: TicketPercent }
      ]
    },
    { label: null, items: [{ href: "/customers/", label: t.nav.customers, icon: UsersRound }] },
    {
      label: t.nav.systemGroup,
      items: [
        { href: "/settings/", label: t.nav.settings, icon: Settings },
        { href: "/activity/", label: t.nav.activity, icon: History },
        { href: "/system-health/", label: t.nav.systemHealth, icon: Activity }
      ]
    }
  ];
}
