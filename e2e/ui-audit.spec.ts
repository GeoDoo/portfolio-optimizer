import { test, expect } from "@playwright/test";

const LOAD_BTN = "role=button[name='Load sample data']";

test.describe("UI Audit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  test("empty state", async ({ page }) => {
    await page.screenshot({ path: "e2e/screenshots/01-empty-state.png", fullPage: true });
    await expect(page.locator("h1")).toContainText("Portfolio Optimizer");
    await expect(page.locator(LOAD_BTN)).toBeVisible();

    // Start month should show "April" not "3"
    const monthSelect = page.locator("select").first();
    const selectedText = await monthSelect.evaluate(
      (el: HTMLSelectElement) => el.options[el.selectedIndex]?.text,
    );
    expect(selectedText).toBe("April");
  });

  test("full page with sample data", async ({ page }) => {
    await page.locator(LOAD_BTN).click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "e2e/screenshots/02-full-page.png", fullPage: true });

    // Squad names appear in sidebar (visible text, not in hidden options)
    await expect(page.locator("text=Payments >> visible=true").first()).toBeVisible();
    await expect(page.locator("text=Growth >> visible=true").first()).toBeVisible();
    await expect(page.locator("text=Platform >> visible=true").first()).toBeVisible();

    // Projects appear
    await expect(page.locator("input[value='Checkout v2']").first()).toBeVisible();
    await expect(page.locator("input[value='API v3 migration']").first()).toBeVisible();

    // AUDIT: "seed-" IDs should NOT be visible in rendered text
    const visibleText = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts: string[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const parent = node.parentElement;
        if (parent && parent.tagName !== "OPTION" && parent.tagName !== "SCRIPT") {
          const t = node.textContent?.trim();
          if (t && t.includes("seed-")) texts.push(t.slice(0, 50));
        }
      }
      return texts;
    });
    console.log(`[AUDIT] Visible "seed-" text (excluding <option>): ${JSON.stringify(visibleText)}`);
    expect(visibleText.length).toBe(0);

    // Squad selects show names not IDs
    const squadSelects = await page.locator("table select").evaluateAll((els) =>
      (els as HTMLSelectElement[]).map((el) => el.options[el.selectedIndex]?.text),
    );
    console.log(`[AUDIT] Squad select displayed values: ${JSON.stringify(squadSelects)}`);
    for (const text of squadSelects) {
      expect(text).not.toMatch(/^seed-/);
    }
  });

  test("sections", async ({ page }) => {
    await page.locator(LOAD_BTN).click();
    await page.waitForTimeout(2000);

    await page.screenshot({ path: "e2e/screenshots/03-top-half.png", clip: { x: 0, y: 0, width: 1440, height: 600 } });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: "e2e/screenshots/04-bottom-half.png", fullPage: false });
  });

  test("visual quality", async ({ page }) => {
    await page.locator(LOAD_BTN).click();
    await page.waitForTimeout(2000);

    const overflows = await page.evaluate(() => {
      const issues: string[] = [];
      document.querySelectorAll("*").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > window.innerWidth + 10) {
          issues.push(`${el.tagName}.${el.className.toString().split(" ")[0]} w=${Math.round(rect.width)}`);
        }
      });
      return issues;
    });
    console.log(`[AUDIT] Overflow: ${overflows.length ? JSON.stringify(overflows) : "none"}`);
    expect(overflows.length).toBe(0);

    const truncated = await page.evaluate(() => {
      const issues: string[] = [];
      document.querySelectorAll("[class*=truncate]").forEach((el) => {
        const h = el as HTMLElement;
        if (h.scrollWidth > h.clientWidth + 2) {
          issues.push(`"${h.textContent?.slice(0, 30)}" (${h.scrollWidth}>${h.clientWidth})`);
        }
      });
      return issues;
    });
    console.log(`[AUDIT] Truncated: ${truncated.length ? JSON.stringify(truncated) : "none"}`);

    const tiny = await page.evaluate(() => {
      const issues: string[] = [];
      const seen = new Set<string>();
      document.querySelectorAll("*").forEach((el) => {
        const h = el as HTMLElement;
        const fs = parseFloat(window.getComputedStyle(h).fontSize);
        const t = h.innerText?.trim();
        if (fs < 10 && t && t.length > 0 && t.length < 50 && !el.children.length) {
          const key = `${t.slice(0, 15)}_${fs}`;
          if (!seen.has(key)) { seen.add(key); issues.push(`"${t.slice(0, 25)}" @ ${fs}px`); }
        }
      });
      return issues.slice(0, 20);
    });
    console.log(`[AUDIT] Tiny text (<10px): ${tiny.length ? JSON.stringify(tiny) : "none"}`);
    expect(tiny.length).toBe(0);
  });
});
