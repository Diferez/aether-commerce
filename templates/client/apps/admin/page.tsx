import { AdminDashboard, RequireAdminAuth } from "@aether/admin-default";

/**
 * Default admin home - keep as-is, or replace with your own. Business
 * pages below (orders/, products/, customers/, ...) show the same
 * keep-or-replace pattern: each is a one-line re-export from
 * @aether/admin-default today, and can be edited individually without
 * touching the rest.
 */
export default function AdminHomePage() {
  return (
    <RequireAdminAuth>
      <AdminDashboard />
    </RequireAdminAuth>
  );
}
