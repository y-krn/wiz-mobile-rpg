import { test, expect } from "./fixtures/browser-health.js";

test("React town records strip updates its read-only projection and hides outside town @smoke", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const updateRecords = async (records, gameState = "town") => page.evaluate(async ({ records, gameState }) => {
    const { createDefaultCurrentRun, state } = await import("/src/state.js");
    const { updateUI } = await import("/src/ui.js");
    state.records = records;
    state.gameState = gameState;
    state.currentRun = gameState === "town" ? null : createDefaultCurrentRun();
    updateUI();
  }, { records, gameState });

  const strip = page.locator("#records-strip");
  await updateRecords({ deepestRetreat: 12, deepestDeath: 9, totalRuns: 7 });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("帰還最深");
  // A record names its dungeon and the floor inside it (#2060).
  await expect(strip).toContainText("大裂溝 B2F");
  await expect(strip).toContainText("地下墓地 B4F");
  await expect(strip).toContainText("死亡最深");
  await expect(strip.locator(":scope > span")).toHaveCount(3);

  await updateRecords({ deepestRetreat: 14, deepestDeath: 10, totalRuns: 8 });
  await expect(strip).toContainText("大裂溝 B4F");
  await expect(strip).toContainText("地下墓地 B5F");
  await expect(strip.locator(":scope > span")).toHaveCount(3);

  await updateRecords({ deepestRetreat: 14, deepestDeath: 10, totalRuns: 8 }, "explore");
  await expect(strip).toBeHidden();
  await updateRecords({ deepestRetreat: 14, deepestDeath: 10, totalRuns: 8 });
  await expect(strip).toBeVisible();
});
