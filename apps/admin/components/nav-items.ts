import { BarChart3, Boxes, ClipboardList, History, Settings, UsersRound, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Read client-side against real data by AdminSidebar - never a fabricated count. */
  countKey?: "pendingOrders" | "lowStock";
};

export type NavGroup = {
  /** null renders no group header - used for single-item groups per the IA spec. */
  label: string | null;
  items: NavItem[];
};

// Ordered by real usage priority (Home > Orders > Products > Inventory >
// Customers > Settings > Activity), grouped per the requested IA (Summary /
// Operations / Relationships / System). A group with exactly one item never
// renders its own header - that's Home and Customers today.
export const navGroups: NavGroup[] = [
  { label: null, items: [{ href: "/", label: "Home", icon: BarChart3 }] },
  {
    label: "Operations",
    items: [
      { href: "/orders/", label: "Orders", icon: ClipboardList, countKey: "pendingOrders" },
      { href: "/products/", label: "Products", icon: Boxes },
      { href: "/inventory/", label: "Inventory", icon: Warehouse, countKey: "lowStock" }
    ]
  },
  { label: null, items: [{ href: "/customers/", label: "Customers", icon: UsersRound }] },
  {
    label: "System",
    items: [
      { href: "/settings/", label: "Settings", icon: Settings },
      { href: "/activity/", label: "Activity", icon: History }
    ]
  }
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);
