import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Same reason and same manual-only setup as admin-products.spec.ts - not
// wired into playwright.config.ts's webServer (which only starts the
// storefront), so this doesn't run in CI's narrow test:e2e:assistant step.
// Run manually against a locally running admin dev server:
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_... pnpm dev:admin
//   pnpm exec playwright test tests/e2e/admin-accessibility.spec.ts --project=desktop
//
// Scope is limited to pages reachable without a real signed-in Clerk
// session (this repo has no way to fake one in Playwright, see
// admin-products.spec.ts): the public demo dashboard at /demo (real
// AdminDashboard content, same component the private dashboard renders)
// and the sign-in gate at /. The authenticated list/detail pages built
// this session (orders, inventory, customers, products) aren't reachable
// here for the same reason and are not covered by this spec.
const criticalOrSerious = (violations: { impact?: string | null }[]) =>
  violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");

test.describe("Admin accessibility - axe scan", () => {
  test("/demo has no critical or serious accessibility violations", async ({ page }) => {
    await page.goto("http://localhost:3001/demo");
    await expect(page.getByRole("heading", { name: /public demo admin/i })).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = criticalOrSerious(results.violations);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test("the sign-in gate has no critical or serious accessibility violations", async ({ page }) => {
    await page.goto("http://localhost:3001/products/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible({ timeout: 15000 });

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = criticalOrSerious(results.violations);
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
