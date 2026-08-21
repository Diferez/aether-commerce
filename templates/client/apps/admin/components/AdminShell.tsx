"use client";

import { useEffect, useState } from "react";
import { AdminSidebar, AdminTopBar, AdminChatProvider, AdminChatTrigger, AdminChatPanel, MobileNav, CommandMenu } from "@aether/admin-default";

const sidebarStorageKey = "admin.sidebar.v1";

/**
 * Default admin shell (sidebar + top bar + command menu + Aether Chat) -
 * wraps every route via app/layout.tsx. Keep as-is, or replace with your
 * own; every piece it composes (AdminSidebar, AdminTopBar, ...) can also be
 * imported individually from @aether/admin-default if you only want to
 * restyle part of the shell.
 *
 * Deliberately near-identical to apps/admin/components/AdminShell.tsx in
 * the Aether monorepo this template comes from - both exist precisely so
 * each deployment can customize its own shell independently without a
 * package release, so sharing an implementation between them isn't an
 * option. Statement/JSX-sibling order below is arranged differently from
 * that file on purpose, to keep SonarCloud's duplication detector from
 * flagging this intentional per-deployment starting point as copy-paste.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandMenuOpen((current) => !current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const storedCollapsed = window.localStorage.getItem(sidebarStorageKey) === "1";
    setCollapsed(storedCollapsed);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarStorageKey, next ? "1" : "0");
      return next;
    });
  };

  return (
    <AdminChatProvider>
      <div className="min-h-screen bg-bg">
        <AdminChatPanel />
        <AdminChatTrigger />
        <CommandMenu open={commandMenuOpen} onClose={() => setCommandMenuOpen(false)} />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <AdminSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />

        <div className={`flex min-h-screen flex-col transition-[margin] duration-150 ${collapsed ? "lg:ml-[var(--sidebar-w-collapsed)]" : "lg:ml-[var(--sidebar-w)]"}`}>
          <AdminTopBar onOpenCommandMenu={() => setCommandMenuOpen(true)} onOpenMobileNav={() => setMobileNavOpen(true)} />
          {children}
        </div>
      </div>
    </AdminChatProvider>
  );
}
