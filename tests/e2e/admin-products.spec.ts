import { expect, test } from "@playwright/test";

// Not wired into playwright.config.ts's webServer (which only starts the
// storefront) - adding a second global webServer there would make it start
// for every Playwright invocation, including CI's narrow
// `pnpm test:e2e:assistant` step, which has no NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
// in scope and would crash `next dev` for a spec that never even touches
// admin. Run this one manually against a locally running admin dev server:
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm dev:admin
//   pnpm exec playwright test tests/e2e/admin-products.spec.ts --project=desktop
//
// The full authenticated create -> edit -> publish flow needs a real (or
// @clerk/testing-mocked) signed-in session, which this repo doesn't have set
// up - Clerk's client SDK manages its own session state and isn't something
// page.route() can convincingly fake the way the assistant-widget spec mocks
// plain JSON API calls. What's genuinely verifiable without that is the
// authorization gate itself: an unauthenticated visitor must see the
// sign-in prompt, never the real product management UI or any product data.
test.describe("Admin products - unauthenticated access", () => {
  for (const path of ["/products/", "/products/new/"]) {
    test(`${path} shows the sign-in gate instead of the product UI`, async ({ page }) => {
      await page.goto(`http://localhost:3001${path}`);

      await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("button", { name: /new product/i })).not.toBeVisible();
      await expect(page.getByText(/products in the catalog/i)).not.toBeVisible();
    });
  }
});
