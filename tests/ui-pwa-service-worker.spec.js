import { test, expect } from "./fixtures/browser-health.js";

test("Vite development sessions do not register the production Service Worker @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#dungeon-canvas")).toHaveAttribute("data-renderer", "pixi");
  const registrations = await page.evaluate(() => navigator.serviceWorker.getRegistrations());
  expect(registrations).toHaveLength(0);
  await expect(page.locator("#pwa-update-banner")).toBeHidden();
});
