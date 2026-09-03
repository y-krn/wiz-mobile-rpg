import { test, expect } from './fixtures/browser-health.js';

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

    // 1. Mageを選択して潜行
    await page.click('#btn-town-dungeon');
    await page.getByRole('button', { name: /術式の旅装キット/ }).click();
    await page.getByRole('button', { name: /B1Fから開始/ }).click();
    await page.getByRole('button', { name: '迷宮へ向かう' }).click();

    // 3. Open Spell overlay
    await page.click('#btn-cast');
    await expect(page.locator('#spell-overlay')).toBeVisible();

    // Select Ged (Mage) in caster bar
    const gedCasterBtn = page.locator('.spell-caster-btn:has-text("Ged")');
    await gedCasterBtn.click();

    // Select DUMAPIC spell card
    const dumapicCard = page.locator('.spell-item-row-card:has-text("DUMAPIC")');
    await dumapicCard.click();

    // Cast DUMAPIC
    await page.click('#btn-spell-cast-action');

    const location = page.locator('#location-label');
    await expect(location).toContainText('B1F');
    await expect(location).not.toContainText(/X:\d+|Y:\d+/);

    const viewportHud = page.locator('#viewport-hud');
    await expect(viewportHud).toBeVisible();
    await expect(viewportHud).toContainText('方角:');
    await expect(viewportHud).not.toContainText(/X:\d+|Y:\d+|DUMAPIC/);

    const logText = await page.locator('#log-content').textContent();
    expect(logText).toMatch(/DUMAPIC — B1 \/ .+向き/);
    expect(logText).toMatch(/測量座標 X:\d+ Y:\d+/);
    expect((logText.match(/X:\d+ Y:\d+/g) || [])).toHaveLength(1);

    // Verify HUD elements are actually visible and the layout remains usable.
    const hud = page.locator('#viewport-hud');
    await expect(hud).toBeVisible();
    
    const logs = page.locator('#log-content');
    await expect(logs).toBeVisible();
  });
}
