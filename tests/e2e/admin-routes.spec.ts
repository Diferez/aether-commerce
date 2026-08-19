import { expect, test } from "@playwright/test";

// Same reason and same manual-only setup as admin-products.spec.ts - not
// wired into playwright.config.ts's webServer (which only starts the
// storefront), so this doesn't run in CI's narrow test:e2e:assistant step.
// Run manually against a locally running admin dev server:
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm dev:admin
//   pnpm exec playwright test tests/e2e/admin-routes.spec.ts --project=desktop
//
// Extends the same unauthenticated-gate coverage to the Orders, Customers,
// Inventory and Settings sections built later in this project - this repo
// still has no way to fake a real signed-in Clerk session (see
// admin-products.spec.ts), so the authenticated list/detail flows for these
// routes remain untested by E2E; what's verifiable here is that each route
// hides its real UI and data behind the sign-in gate.
test.describe("Admin routes - unauthenticated access", () => {
  for (const path of ["/orders/", "/customers/", "/inventory/", "/settings/"]) {
    test(`${path} shows the sign-in gate instead of the admin UI`, async ({ page }) => {
      await page.goto(`http://localhost:3001${path}`);

      await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });
    });
  }

  test("/orders/ hides order data behind the sign-in gate", async ({ page }) => {
    await page.goto("http://localhost:3001/orders/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("link", { name: /new whatsapp order/i })).not.toBeVisible();
  });

  test("/customers/ hides customer data behind the sign-in gate", async ({ page }) => {
    await page.goto("http://localhost:3001/customers/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/customers tracked/i)).not.toBeVisible();
  });

  test("/inventory/ hides stock data behind the sign-in gate", async ({ page }) => {
    await page.goto("http://localhost:3001/inventory/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /apply/i })).not.toBeVisible();
  });

  test("/settings/ hides settings forms behind the sign-in gate", async ({ page }) => {
    await page.goto("http://localhost:3001/settings/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /^save$/i })).not.toBeVisible();
  });
});
