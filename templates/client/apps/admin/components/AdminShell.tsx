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
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(sidebarStorageKey) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarStorageKey, next ? "1" : "0");
      return next;
    });
  }

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

  return (
    <AdminChatProvider>
      <div className="min-h-screen bg-bg">
        <AdminSidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        <CommandMenu open={commandMenuOpen} onClose={() => setCommandMenuOpen(false)} />
        <AdminChatTrigger />
        <AdminChatPanel />

        <div className={`flex min-h-screen flex-col transition-[margin] duration-150 ${collapsed ? "lg:ml-[var(--sidebar-w-collapsed)]" : "lg:ml-[var(--sidebar-w)]"}`}>
          <AdminTopBar onOpenMobileNav={() => setMobileNavOpen(true)} onOpenCommandMenu={() => setCommandMenuOpen(true)} />
          {children}
        </div>
      </div>
    </AdminChatProvider>
  );
}
