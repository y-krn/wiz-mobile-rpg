import { test, expect } from './fixtures/browser-health.js';

test('Workshop replaces the retired town shop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#btn-town-shop')).toHaveCount(0);
  await page.locator('#btn-town-workshop').click();
  await expect(page.locator('#submenu-title')).toContainText('工房');
  await expect(page.locator('.workshop-node')).toHaveCount(7);
  await expect(page.getByRole('button', { name: /棘盾の記憶|学者の眼の記憶|薄氷の誓約/ })).toHaveCount(0);
  await expect(page.locator('#submenu-options')).toContainText('潜行開始時にレイピアを選べる');
});
