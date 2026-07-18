import { test, expect } from '@playwright/test';

test('Combat Auto button test', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForTimeout(1000);

  // 1. クラスを選び、単独で迷宮に入る
  const enterBtn = page.locator('#btn-town-dungeon');
  await enterBtn.click();
  await page.getByRole('button', { name: /戦士/ }).click();

  // 強制的に戦闘を開始する
  await page.evaluate(async () => {
    const { startCombat } = await import('/src/combat.js');
    startCombat(false, false);
  });
  await page.waitForTimeout(500);

  // 戦闘に入ったことを確認
  const combatPrompt = page.locator('#combat-prompt');
  expect(await combatPrompt.isVisible()).toBe(true);

  // 戦闘に入ったら、オートボタンのテキストとクラスを確認
  const autoBtn = page.locator('#btn-combat-auto');
  const text = (await autoBtn.textContent()).trim();
  const className = await autoBtn.getAttribute('class');
  
  console.log(`Combat Auto Button at start - Text: "${text}", Class: "${className}"`);
  
  // 初期状態では「オート」であるべき
  expect(text).toBe('オート');
  expect(className).not.toContain('active');
});

const COMBAT_OVERLAY_VIEWPORTS = [
  { width: 360, height: 800, name: 'Galaxy S20' },
  { width: 390, height: 844, name: 'iPhone 13' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
];

for (const vp of COMBAT_OVERLAY_VIEWPORTS) {
  test(`Combat selection overlays fit mobile width on ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('/');
    await page.waitForTimeout(1000);

    await page.evaluate(async () => {
      const { state, createSoloCharacter } = await import('/src/state.js');
      const { startCombat } = await import('/src/combat.js');
      state.party = [createSoloCharacter('Priest')];
      state.inventory = ['HEAL_POTION'];
      state.gameState = 'explore';
      state.floor = 1;
      startCombat(false, false);
    });

    const verifyCombatOverlay = async (actionButtonId, overlayType) => {
      await page.locator(actionButtonId).click();
      await expect(page.locator('#combat-overlay')).toBeVisible();
      await expect(page.locator(`body:has(#combat-overlay[style*="flex"])`)).toBeVisible();
      await expect(page.locator('#controls-panel .controls-group.active')).toHaveCount(0);

      const metrics = await page.evaluate((type) => {
        const viewportWidth = document.documentElement.clientWidth;
        const overlay = document.getElementById('combat-overlay');
        const back = overlay.querySelector('.btn-combat-back');
        const backRect = back.getBoundingClientRect();
        const visibleOverflow = Array.from(overlay.querySelectorAll('*'))
          .filter((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              rect.width > 0 &&
              rect.height > 0 &&
              (rect.left < -1 || rect.right > viewportWidth + 1);
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), className: el.className, left: rect.left, right: rect.right };
          });
        return {
          type,
          title: overlay.querySelector('.combat-overlay-title')?.textContent,
          backHeight: backRect.height,
          overflowCount: visibleOverflow.length,
          visibleOverflow,
        };
      }, overlayType);

      expect(metrics.title, `${overlayType} should render a title on ${vp.name}`).toBeTruthy();
      expect(metrics.backHeight, `${overlayType} back button should be tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(metrics.overflowCount, `${overlayType} should not overflow horizontally on ${vp.name}: ${JSON.stringify(metrics.visibleOverflow)}`).toBe(0);

      await page.locator('#combat-overlay .btn-combat-back').click();
      await expect(page.locator('#combat-overlay')).toBeHidden();
      await expect(page.locator('#combat-controls')).toBeVisible();
    };

    await verifyCombatOverlay('#btn-combat-fight', 'combat_target');
    await verifyCombatOverlay('#btn-combat-spell', 'combat_spell');
    await verifyCombatOverlay('#btn-combat-item', 'combat_item');
  });
}
