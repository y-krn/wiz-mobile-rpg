import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`Noise ball direction controls fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { openSubmenu, menuContext } = await import('/src/navigation.js');
      await import('/src/menu/submenu_router.js');
      state.gameState = 'explore';
      state.inventory = ['NOISE_BALL'];
      menuContext.itemKey = 'NOISE_BALL';
      menuContext.itemIdx = 0;
      openSubmenu('item_direction_select', '鳴らし玉を投げる方向:');
      return Array.from(document.querySelectorAll('#submenu-options .btn')).map(button => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent, height: rect.height, left: rect.left, right: rect.right };
      });
    });
    expect(result.map(item => item.text)).toEqual(['北へ投げる', '東へ投げる', '南へ投げる', '西へ投げる']);
    for (const button of result) {
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.left).toBeGreaterThanOrEqual(0);
      expect(button.right).toBeLessThanOrEqual(viewport.width);
    }
  });
}
