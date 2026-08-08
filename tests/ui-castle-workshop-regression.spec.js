import { test, expect } from '@playwright/test';

test('Castle to workshop transition keeps the workshop grid readable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');

    state.gameState = 'town';
    state.inventory = [];
    state.records = {
      deepestRetreat: 4,
      deepestDeath: 3,
      deepestByClass: { Fighter: 2 },
      totalRuns: 7,
    };
    state.metaMaterials = { '獣の牙': 20, '鉄片': 10 };
    state.workshop = { ranks: {} };
    updateUI();
  });

  await page.locator('#btn-town-castle').click();
  const castleLayout = await page.locator('#submenu-options').evaluate((options) => ({
    style: options.getAttribute('style'),
    display: getComputedStyle(options).display,
    columnCount: getComputedStyle(options).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
    summaryCards: options.querySelectorAll('.records-menu-summary > div').length,
    classRecords: options.querySelector('.records-class-list')?.textContent,
    deathLogsButton: options.querySelector('button')?.textContent,
  }));

  expect(castleLayout.style).toBeNull();
  expect(castleLayout.display).toBe('grid');
  expect(castleLayout.columnCount).toBe(1);
  expect(castleLayout.summaryCards).toBe(3);
  expect(castleLayout.classRecords).toContain('戦士 B2F');
  expect(castleLayout.deathLogsButton).toBe('全滅ログ確認');

  await page.locator('#btn-submenu-back').click();
  await expect(page.locator('#town-controls')).toBeVisible();
  await page.locator('#btn-town-workshop').click();

  const workshopLayout = await page.locator('#submenu-options').evaluate((options) => ({
    style: options.getAttribute('style'),
    display: getComputedStyle(options).display,
    workshopClass: options.classList.contains('workshop-grid'),
    nodeCount: options.querySelectorAll('.workshop-node').length,
    clippedNodeCount: Array.from(options.querySelectorAll('.workshop-node'))
      .filter((node) => node.scrollHeight > node.clientHeight).length,
  }));

  expect(workshopLayout.style).toBeNull();
  expect(workshopLayout.display).toBe('grid');
  expect(workshopLayout.workshopClass).toBe(true);
  expect(workshopLayout.nodeCount).toBe(18);
  expect(workshopLayout.clippedNodeCount).toBe(0);

  await page.locator('#btn-submenu-back').click();
  await expect(page.locator('#town-controls')).toBeVisible();
  await page.locator('#btn-town-castle').click();
  const reverseLayout = await page.locator('#submenu-options').evaluate((options) => ({
    castleClass: options.classList.contains('castle-grid'),
    workshopClass: options.classList.contains('workshop-grid'),
    style: options.getAttribute('style'),
  }));

  expect(reverseLayout.castleClass).toBe(true);
  expect(reverseLayout.workshopClass).toBe(false);
  expect(reverseLayout.style).toBeNull();
});
