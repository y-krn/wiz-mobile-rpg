import { test, expect } from '@playwright/test';

test('Workshop replaces the retired town shop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#btn-town-shop')).toHaveCount(0);
  await page.locator('#btn-town-workshop').click();
  await expect(page.locator('#submenu-title')).toContainText('工房');
  await expect(page.locator('.workshop-node')).toHaveCount(12);
  await expect(page.locator('#submenu-options')).toContainText('任意のフロアから撤退できる');
});
