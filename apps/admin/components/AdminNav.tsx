"use client";

import { BarChart3, Boxes, ClipboardList, Mail, Settings, ShieldCheck } from "lucide-react";
import { useAuth, UserButton } from "@clerk/react";
import { storefrontUrl } from "./config";

const nav = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/demo", label: "Public demo", icon: ShieldCheck },
  { href: "/products/", label: "Products", icon: Boxes },
  { href: "/orders/", label: "Orders", icon: ClipboardList },
  { href: "#messages", label: "Messages", icon: Mail },
  { href: "#settings", label: "Settings", icon: Settings }
];

export function AdminNav() {
  const { isSignedIn } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
      <div className="admin-shell flex min-h-16 items-center justify-between gap-4">
        <a href="/" className="font-semibold">
          Aether Admin
          <span className="block text-xs font-normal text-zinc-500">Operations console</span>
        </a>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Admin">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100">
              <item.icon size={16} aria-hidden />
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href={storefrontUrl} className="focus-ring rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold">
            Storefront
          </a>
          {isSignedIn ? <UserButton /> : null}
        </div>
      </div>
    </header>
  );
}
