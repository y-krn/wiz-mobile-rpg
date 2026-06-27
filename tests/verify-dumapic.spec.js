import { test, expect } from '@playwright/test';
import * as path from 'path';

const VIEWPORTS = [
  { width: 360, height: 800, name: 'Galaxy_S20' },
  { width: 390, height: 844, name: 'iPhone_13' },
  { width: 430, height: 932, name: 'iPhone_14_Pro_Max' },
];

const ARTIFACT_DIR = '/Users/ottan/.gemini/antigravity/brain/5b5dd480-a376-487c-915f-807823648378';

for (const vp of VIEWPORTS) {
  test(`Verify DUMAPIC on ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    // Set viewport
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    // Clear local storage and reload
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await page.waitForTimeout(500);

    // 1. Enter Training Grounds
    await page.click('#btn-town-training');
    await page.waitForTimeout(500);

    // Add roster characters to party (add first 4 characters to include Mage Ged)
    for (let i = 0; i < 4; i++) {
      await page.locator('.char-row').first().click();
      await page.locator('button:has-text("を編成に加える"):visible').first().click();
      await page.waitForTimeout(300);
    }

    // Take screenshot of training grounds
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `debug_1_training_${vp.width}.png`) });

    // Go back to town
    const backBtn = page.locator('#btn-submenu-back:visible, .btn-camp-close:visible, button:has-text("戻る"):visible, button:has-text("閉じる"):visible').first();
    await backBtn.click();
    await page.waitForTimeout(500);

    // 2. Enter Dungeon
    await page.click('#btn-town-dungeon');
    await page.waitForTimeout(500);

    // Take screenshot of dungeon entrance
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `debug_2_dungeon_${vp.width}.png`) });

    // 3. Open Spell overlay
    await page.click('#btn-cast');
    await page.waitForTimeout(500);

    // Take screenshot of spell overlay
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `debug_3_spell_${vp.width}.png`) });

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

    // 4. Take screenshots of Viewport HUD and log panel
    // Take screenshot of the whole page to inspect layout
    const screenshotPath = path.join(ARTIFACT_DIR, `dumapic_layout_${vp.width}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to: ${screenshotPath}`);

    // Verify HUD elements are actually visible
    const hud = page.locator('#viewport-hud');
    await expect(hud).toBeVisible();
    
    const logs = page.locator('#log-content');
    await expect(logs).toBeVisible();
  });
}
