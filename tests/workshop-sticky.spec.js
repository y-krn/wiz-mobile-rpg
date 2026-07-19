import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function scrollWorkshopToBottom(page) {
  return page.locator('#submenu-options').evaluate((grid) => {
    grid.scrollTop = grid.scrollHeight;
    const hud = grid.querySelector('.materials-hud');
    const gridBox = grid.getBoundingClientRect();
    const hudBox = hud.getBoundingClientRect();
    const backgroundColor = getComputedStyle(hud).backgroundColor;
    const colorChannels = backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
    return {
      alpha: colorChannels.length === 4 ? colorChannels[3] : 1,
      backgroundColor,
      gridTop: gridBox.top,
      hudTop: hudBox.top,
      hudBottom: hudBox.bottom,
      position: getComputedStyle(hud).position,
      scrollTop: grid.scrollTop,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`Workshop materials stay visible at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { openSubmenu } = await import('/src/navigation.js');

      state.gameState = 'town';
      state.metaMaterials = { '獣の牙': 20, '鉄片': 10 };
      state.workshop = { ranks: {} };
      openSubmenu('workshop_main', '工房 - 恒久アンロック');
    });

    const assertStickyBalance = async () => {
      const layout = await scrollWorkshopToBottom(page);
      expect(layout.scrollTop).toBeGreaterThan(0);
      expect(layout.position).toBe('sticky');
      expect(layout.hudTop).toBeGreaterThanOrEqual(layout.gridTop - 1);
      expect(layout.hudTop).toBeLessThanOrEqual(layout.gridTop + 1);
      expect(layout.hudBottom).toBeLessThanOrEqual(viewport.height);
      expect(layout.alpha, `HUD background ${layout.backgroundColor} must be opaque`).toBe(1);
    };

    await assertStickyBalance();

    await page.getByRole('button', { name: /軽量武器候補/ }).click();
    await expect(page.locator('.materials-hud')).toContainText('獣の牙:16 / 鉄片:8');
    await assertStickyBalance();
  });
}
