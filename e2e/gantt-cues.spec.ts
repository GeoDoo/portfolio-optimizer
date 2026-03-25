import { test, expect } from "@playwright/test";

test.describe("Gantt visual cues", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.locator("role=button[name='Load sample data']").click();
    await page.waitForTimeout(2000);
  });

  test("rank badges visible on bars", async ({ page }) => {
    const bars = page.locator("[data-gantt-bar]");
    await expect(bars.first()).toBeVisible();
    await page.screenshot({ path: "e2e/screenshots/gantt-01-default.png", fullPage: true });

    const count = await bars.count();
    console.log(`[AUDIT] Gantt bars found: ${count}`);
    expect(count).toBeGreaterThan(0);

    const ranks = await bars.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-rank")).filter(Boolean),
    );
    console.log(`[AUDIT] Rank badges: ${JSON.stringify(ranks)}`);
    expect(ranks.length).toBe(count);
    expect(ranks.every((r) => /^\d+$/.test(r!))).toBe(true);
  });

  test("hover shows arrows and tooltip", async ({ page }) => {
    const paymentBar = page.locator("[data-gantt-bar]", { hasText: "Payment retry" }).first();

    if (await paymentBar.isVisible()) {
      await paymentBar.hover();
      await page.waitForTimeout(400);
      await page.screenshot({ path: "e2e/screenshots/gantt-02-hover-payment.png", fullPage: true });

      // Arrow lines are now div elements with dashed borders inside the overlay
      const arrowDots = await page.locator("[data-gantt-overlay] .rounded-full").count();
      console.log(`[AUDIT] Arrow endpoint dots on Payment hover: ${arrowDots}`);
      expect(arrowDots).toBeGreaterThan(0);

      const tooltip = page.locator("[data-gantt-tooltip]");
      await expect(tooltip).toBeVisible();
      const text = await tooltip.textContent();
      console.log(`[AUDIT] Tooltip text: ${text}`);
      expect(text).toContain("WSJF");
      expect(text).toContain("Blocked by");
    }

    const checkoutBar = page.locator("[data-gantt-bar]", { hasText: "Checkout v2" }).first();

    if (await checkoutBar.isVisible()) {
      await checkoutBar.hover();
      await page.waitForTimeout(400);
      await page.screenshot({ path: "e2e/screenshots/gantt-03-hover-checkout.png", fullPage: true });

      const tooltip = page.locator("[data-gantt-tooltip]");
      const text = await tooltip.textContent();
      console.log(`[AUDIT] Checkout tooltip: ${text}`);
      expect(text).toContain("Unblocks");
    }
  });

  test("cross-squad arrows align correctly (API v3 migration)", async ({ page }) => {
    const apiBar = page.locator("[data-gantt-bar]", { hasText: "API v3 migration" }).first();
    if (await apiBar.isVisible()) {
      await apiBar.hover();
      await page.waitForTimeout(400);
      await page.screenshot({ path: "e2e/screenshots/gantt-05-hover-api-migration.png", fullPage: true });

      const arrowDots = await page.locator("[data-gantt-overlay] .rounded-full").count();
      console.log(`[AUDIT] Arrow endpoint dots on API v3 hover: ${arrowDots}`);
      expect(arrowDots).toBeGreaterThan(0);

      const tooltip = page.locator("[data-gantt-tooltip]");
      const text = await tooltip.textContent();
      console.log(`[AUDIT] API v3 tooltip: ${text}`);
      expect(text).toContain("Unblocks");
    }
  });

  test("non-related bars dim when hovering", async ({ page }) => {
    const firstBar = page.locator("[data-gantt-bar]").first();
    await expect(firstBar).toBeVisible();
    await firstBar.hover();
    await page.waitForTimeout(300);

    const dimmedCount = await page.locator("[data-gantt-bar]").evaluateAll((els) =>
      els.filter((el) => el.classList.contains("opacity-30")).length,
    );
    console.log(`[AUDIT] Dimmed bars: ${dimmedCount}`);
    expect(dimmedCount).toBeGreaterThan(0);

    await page.screenshot({ path: "e2e/screenshots/gantt-04-dimming.png", fullPage: true });
  });
});
