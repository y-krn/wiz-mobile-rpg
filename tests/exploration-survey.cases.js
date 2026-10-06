import { test, expect } from './fixtures/browser-health.js';
import { satchelAction } from './explore-input-helpers.js';

const VIEWPORTS = [
  { width: 360, height: 800, name: 'Galaxy_S20' },
  { width: 390, height: 844, name: 'iPhone_13' },
  { width: 430, height: 932, name: 'iPhone_14_Pro_Max' },
];

for (const vp of VIEWPORTS) {
  test(`DUMAPIC shows an instant survey without persistent coordinates on ${vp.name} (${vp.width}x${vp.height}) @e2e`, async ({ page }) => {
    // Set viewport
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    // Clear local storage and reload
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');

    // 1. 旧クラス由来の呪文経路は開始キットとは独立して検証する
    await page.click('#btn-town-dungeon');
    await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const caster = createStartingKitCharacter('arcana');
      caster.mediumState.socketedRunes = ['RUNE_DUMAPIC'];
      state.party = [caster];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 1;
      state.gameState = 'explore';
      (await import('/src/ui.js')).updateUI();
    });

    // 3. Open Spell overlay
    await (await satchelAction(page, '#btn-cast')).click();
    await expect(page.locator('#spell-overlay')).toBeVisible();

    // Select the first available caster. Starting-kit characters intentionally
    // use the shared Adventurer name rather than legacy class names.
    await page.locator('.spell-caster-btn').first().click();

    // Select DUMAPIC spell card
    const dumapicCard = page.locator('.spell-item-row-card:has-text("測量")');
    await dumapicCard.click();

    // Cast DUMAPIC
    await page.click('#btn-spell-cast-action');

    const location = page.locator('#location-label');
    await expect(location).toContainText('B1F');
    await expect(location).not.toContainText(/X:\d+|Y:\d+/);

    const viewportHud = page.locator('#viewport-hud');
    await expect(viewportHud).toBeVisible();
    await expect(viewportHud).toContainText('方角:');
    await expect(viewportHud).not.toContainText(/X:\d+|Y:\d+|測量/);

    // The explore strip shows only the newest line (#1832); the survey is read
    // in full from the log overlay.
    await page.click('#btn-log-expand');
    const logText = await page.locator('#log-overlay-body').textContent();
    await page.click('#btn-log-overlay-close');
    expect(logText).toMatch(/測量 — B1 \/ .+向き/);
    expect(logText).toMatch(/測量座標 X:\d+ Y:\d+/);
    expect((logText.match(/X:\d+ Y:\d+/g) || [])).toHaveLength(1);

    // Verify HUD elements are actually visible and the layout remains usable.
    const hud = page.locator('#viewport-hud');
    await expect(hud).toBeVisible();
    
    const logs = page.locator('#log-content');
    await expect(logs).toBeVisible();
  });
}
