import { test, expect } from './fixtures/browser-health.js';

// The return badge (#2001) marks only what a safe return puts back in the
// town storage: usable supplies prepared at departure. Kit equipment and
// workshop grants stay unmarked, while their ownership state is unchanged.

async function seedRun(page, { prepared = [], inventory = [] } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async ({ prepared, inventory }) => {
    const { createDefaultCurrentRun, initNewGame, state } = await import('/src/state.js');
    const { createDepartureCharacter } = await import('/src/systems/departure_preparation.js');
    initNewGame();
    state.party = [createDepartureCharacter('vanguard').character];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.departureCraftItems = prepared;
    state.currentRun.townInventory = [...inventory];
    state.inventory = [...inventory];
    state.floor = 1;
    state.gameState = 'explore';
    (await import('/src/ui.js')).updateUI();
  }, { prepared, inventory });
}

test('Kit equipment carries no return badge on the equipment screen', async ({ page }, testInfo) => {
  await seedRun(page);
  await page.evaluate(async () => {
    (await import('/src/equip_ui.js')).openEquipOverlay(0);
  });
  const equipped = page.locator('.equip-equipped-row');
  await expect(equipped.first()).toBeVisible();
  // The kit's pieces are still the adventurer's own: the state is unchanged.
  await expect(equipped.first()).toHaveAttribute('data-ownership', 'town-confirmed');
  await expect(page.locator('#equip-overlay .ownership-badge')).toHaveCount(0);

  await equipped.first().click();
  await expect(page.locator('.equip-detail-desc').first()).toBeVisible();
  await expect(page.locator('#equip-overlay .ownership-badge')).toHaveCount(0);
  await testInfo.attach('issue-2001-equip-390x844', { body: await page.screenshot(), contentType: 'image/png' });
});

test('The bag marks only supplies prepared at departure, and only as many as were prepared', async ({ page }, testInfo) => {
  // Two potions prepared, a third from the kit, and a workshop return wing.
  await seedRun(page, {
    prepared: ['HEAL_POTION', 'HEAL_POTION'],
    inventory: ['HEAL_POTION', 'HEAL_POTION', 'HEAL_POTION', 'TOWN_PORTAL', 'ANTIDOTE'],
  });
  const rows = await page.evaluate(async () => {
    const { renderItemInventory } = await import('/src/menu/explore_actions.js');
    const grid = document.createElement('div');
    renderItemInventory(grid);
    return Array.from(grid.querySelectorAll('button[data-ownership]')).map(button => ({
      name: button.textContent,
      ownership: button.dataset.ownership,
      badge: button.parentElement.querySelector('.ownership-badge')?.textContent ?? null,
    }));
  });
  const potions = rows.filter(row => row.name === '傷薬');
  expect(potions.map(row => row.badge)).toEqual(['持ち込み品・生還時に倉庫へ', '持ち込み品・生還時に倉庫へ', null]);
  expect(rows.filter(row => row.name !== '傷薬').map(row => row.badge)).toEqual([null, null]);
  expect(new Set(rows.map(row => row.ownership))).toEqual(new Set(['town-confirmed']));

  await page.evaluate(async () => {
    const { openSubmenu } = await import('/src/navigation.js');
    openSubmenu('item_inventory', 'バッグ');
  });
  await expect(page.locator('#submenu-options .ownership-badge')).toHaveCount(2);
  await testInfo.attach('issue-2001-bag-390x844', { body: await page.screenshot(), contentType: 'image/png' });
});
