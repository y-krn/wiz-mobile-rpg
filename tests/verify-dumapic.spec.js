import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 360, height: 800, name: 'Galaxy_S20' },
  { width: 390, height: 844, name: 'iPhone_13' },
  { width: 430, height: 932, name: 'iPhone_14_Pro_Max' },
];

for (const vp of VIEWPORTS) {
  test(`Verify DUMAPIC on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    // Set viewport
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    // Clear local storage and reload
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await page.waitForTimeout(500);

    // 1. Mageを選択して潜行
    await page.click('#btn-town-dungeon');
    await page.getByRole('button', { name: /魔術師/ }).click();

    // 3. Open Spell overlay
    await page.click('#btn-cast');
    await page.waitForTimeout(500);

    // Select Ged (Mage) in caster bar
    const gedCasterBtn = page.locator('.spell-caster-btn:has-text("Ged")');
    await gedCasterBtn.click();
    await page.waitForTimeout(300);

    // Select DUMAPIC spell card
    const dumapicCard = page.locator('.spell-item-row-card:has-text("DUMAPIC")');
    await dumapicCard.click();
    await page.waitForTimeout(300);

    // Cast DUMAPIC
    await page.click('#btn-spell-cast-action');
    await page.waitForTimeout(500);

    // Verify HUD elements are actually visible
    const hud = page.locator('#viewport-hud');
    await expect(hud).toBeVisible();
    
    const logs = page.locator('#log-content');
    await expect(logs).toBeVisible();
  });
}
