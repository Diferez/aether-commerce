"use client";

import { useState } from "react";
import { AdminSidebar, AdminTopBar, RequireAdminAuth } from "@aether/admin-default";

/**
 * Default admin shell (sidebar + top bar) - keep as-is, or replace with your
 * own. Business pages (orders/products/customers/...) aren't part of this
 * default skin yet; build those against @aether/api-client the same way
 * apps/admin's own reference pages do.
 */
export default function AdminHomePage() {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <RequireAdminAuth>
      <AdminSidebar collapsed={collapsed} onToggleCollapsed={() => setCollapsed((value) => !value)} />
      <AdminTopBar onOpenMobileNav={() => {}} onOpenCommandMenu={() => {}} />
    </RequireAdminAuth>
  );
}
