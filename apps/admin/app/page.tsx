"use client";

import { useAuth, SignIn } from "@clerk/react";
import { AdminDashboard } from "../components/AdminDashboard";

export default function AdminPage() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div className="admin-shell flex justify-center py-16">
        <SignIn routing="hash" />
      </div>
    );
  }

  return <AdminDashboard />;
}
