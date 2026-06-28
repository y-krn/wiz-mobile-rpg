import { test } from '@playwright/test';

test('Take shop screenshots for manual verification', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);
  
  // Click on ボルタック商店
  const shopBtn = page.locator('#btn-town-shop');
  await shopBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot of the shop list
  await page.screenshot({ path: '/Users/ottan/.gemini/antigravity/brain/3f044592-2ad0-4752-80b6-a53646710fa1/shop_list.png' });

  // Click on 祝福の聖水
  const holyWaterRow = page.locator('.shop-item-row:has-text("祝福の聖水")');
  await holyWaterRow.click();
  await page.waitForTimeout(1000);

  // Take screenshot of the detailed screen
  await page.screenshot({ path: '/Users/ottan/.gemini/antigravity/brain/3f044592-2ad0-4752-80b6-a53646710fa1/shop_holy_water_detail.png' });
});
