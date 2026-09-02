import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function seedPortalRun(page) {
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createSoloCharacter, state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');

    state.party = [createSoloCharacter('Fighter')];
    state.party[0].hp = 12;
    state.party[0].mp = 0;
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'PORTAL-WING-UI';
    state.currentRun.startedAt = 1;
    state.currentRun.materials = { '獣の牙': 3, '鉄片': 2 };
    state.currentRun.townInventory = ['TOWN_PORTAL'];
    state.currentRun.unbankedObjectLoot = [
      { id: 'loot-sword', item: { baseId: 'LONG_SWORD', instanceId: 'sword-1', identified: true } },
      { id: 'loot-potion', item: 'GREATER_HEAL' },
      { id: 'loot-equipped', item: { baseId: 'SHORT_SWORD', instanceId: 'equipped-1', identified: true } },
    ];
    state.inventory = ['TOWN_PORTAL', 'GREATER_HEAL'];
    state.party[0].equipment.weapon = state.currentRun.unbankedObjectLoot[2].item;
    state.floor = 5;
    state.gameState = 'explore';
    openSubmenu('milestone_portal', 'B5F帰還の門');
  });
}

for (const viewport of VIEWPORTS) {
  test(`Portal decision is explicit and thumb-safe at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await seedPortalRun(page);

    await expect(page.locator('.milestone-portal-vitals')).toContainText('HP 12/20');
    await expect(page.locator('.milestone-portal-vitals')).toContainText('MP 0/0');
    await expect(page.locator('.milestone-portal-bag')).toHaveAttribute('aria-label', 'バッグ 2/20枠');
    await expect(page.locator('[data-info-role="unbanked-object-loot"]')).toContainText('3点');
    await expect(page.locator('[data-info-role="next-band-clue"]')).toBeVisible();

    const choices = page.locator('.milestone-portal-choice-card > .milestone-portal-choice');
    await expect(choices).toHaveCount(2);
    const choiceBoxes = await choices.evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect();
      return { height: box.height, width: box.width };
    }));
    expect(choiceBoxes[0].height).toBeGreaterThanOrEqual(44);
    expect(choiceBoxes[1].height).toBeGreaterThanOrEqual(44);
    expect(choiceBoxes[0].height).toBeCloseTo(choiceBoxes[1].height, 1);
    expect(choiceBoxes[0].width).toBeCloseTo(choiceBoxes[1].width, 1);

    await page.locator('.milestone-portal-choice-card[data-portal-decision="push"] button').click();
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('Pushを確定しますか？');
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('失われません');
    await page.locator('#btn-portal-confirm').click();
    await expect(page.locator('#explore-controls')).toBeVisible();
    const lootAfterPush = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { count: state.currentRun.unbankedObjectLoot.length, inventory: state.inventory.slice() };
    });
    expect(lootAfterPush).toEqual({ count: 3, inventory: ['TOWN_PORTAL', 'GREATER_HEAL'] });

    await page.evaluate(async () => {
      const { openSubmenu } = await import('/src/navigation.js');
      openSubmenu('milestone_portal', 'B5F帰還の門');
    });
    await page.locator('.milestone-portal-choice-card[data-portal-decision="return"] button').click();
    await expect(page.locator('.milestone-portal-confirmation')).toContainText('Returnを確定しますか？');
    await page.locator('#btn-portal-confirm').click();
    await expect(page.locator('#result-overlay')).toBeVisible();
    await expect(page.locator('#result-overlay')).toContainText('帰還の門');
  });
}

test('Wing shows every unbanked candidate, includes equipped loot, and cancels safely', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedPortalRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext, openSubmenu } = await import('/src/navigation.js');
    state.gameState = 'explore';
    menuContext.itemKey = 'TOWN_PORTAL';
    menuContext.itemIdx = 0;
    openSubmenu('item_target_select', '帰還の翼の対象');
  });

  await expect(page.locator('.wing-selection-status')).toHaveText('救出選択 0/2点');
  await expect(page.locator('[data-loot-id="loot-equipped"]')).toContainText('装備中');
  await expect(page.locator('[data-loot-id^="loot-"]')).toHaveCount(3);
  await page.locator('[data-loot-id="loot-sword"]').click();
  await page.locator('[data-loot-id="loot-potion"]').click();
  await expect(page.locator('.wing-selection-status')).toHaveText('救出選択 2/2点');
  await expect(page.locator('[data-loot-id="loot-equipped"]')).toBeDisabled();

  await page.locator('#btn-submenu-back').click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const afterCancel = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { inventory: state.inventory.slice(), gameState: state.gameState };
  });
  expect(afterCancel).toEqual({ inventory: ['TOWN_PORTAL', 'GREATER_HEAL'], gameState: 'explore' });

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext, openSubmenu } = await import('/src/navigation.js');
    menuContext.itemKey = 'TOWN_PORTAL';
    menuContext.itemIdx = 0;
    state.gameState = 'explore';
    openSubmenu('item_target_select', '帰還の翼の対象');
  });
  await page.locator('[data-loot-id="loot-sword"]').click();
  await page.locator('[data-loot-id="loot-potion"]').click();
  await page.locator('#btn-wing-salvage-confirm').click();
  await expect(page.locator('#result-overlay')).toBeVisible();
  const afterConfirm = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      inventory: state.inventory.slice(),
      banked: state.currentRun.bankedObjectLoot.length,
      lost: state.currentRun.lostObjectLoot.length,
      equipped: state.party[0].equipment.weapon,
    };
  });
  expect(afterConfirm.inventory).toEqual([]);
  expect(afterConfirm.banked).toBe(2);
  expect(afterConfirm.lost).toBe(1);
  expect(afterConfirm.equipped).toBeNull();
});
