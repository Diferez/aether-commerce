"use client";

import type { ReactNode } from "react";
import { useAuth, SignIn } from "@clerk/react";

// Same gate apps/admin/app/page.tsx already uses in front of AdminDashboard -
// pulled out so every new admin-only page (products, and future orders/
// customers pages) gets it without repeating the isLoaded/isSignedIn dance.
// Server-side authorization is what actually protects the data (every
// mutation still goes through requirePermission on the API); this only
// keeps a signed-out visitor from seeing an empty/broken UI shell.
export function RequireAdminAuth({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div id="main-content" className="admin-shell flex justify-center py-16">
        <SignIn routing="hash" />
      </div>
    );
  }

  return <>{children}</>;
}
