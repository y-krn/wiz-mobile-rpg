import { test, expect } from './fixtures/browser-health.js';

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`loot surfaces share the 20-slot bag contract at ${viewport.width}x${viewport.height} @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { openEquipOverlay } = await import('/src/equip.js');
      const { renderItemInventory } = await import('/src/menu/explore_actions.js');
      const { renderChestMenu } = await import('/src/chest/chest_view.js');
      const townItem = {
        kind: 'equipment', instanceId: 'town-bag-item', baseId: 'SHORT_SWORD',
        rarity: 'common', level: 1, identified: true, affixes: [],
      };
      const dungeonItem = {
        kind: 'equipment', instanceId: 'dungeon-bag-item', baseId: 'DAGGER',
        rarity: 'rare', level: 1, identified: false, knowledgeStage: 'discovery',
        tags: ['blade'], hintTags: ['blade'], observedHintTags: [], affixes: [],
      };
      state.party = [createSoloCharacter('Fighter')];
      state.currentRun = {
        townInventory: [townItem],
        unbankedObjectLoot: [{ id: 'loot-dungeon-bag-item', item: dungeonItem }],
        lostObjectLoot: [],
        materials: {},
      };
      state.inventory = [townItem, dungeonItem, 'HEAL_POTION'];
      state.gameState = 'explore';

      const itemGrid = document.createElement('div');
      renderItemInventory(itemGrid);
      const chestGrid = document.querySelector('#submenu-options');
      renderChestMenu({
        chest: { trap: 'none', inspected: false, identifiedTrap: '', lootHint: null },
        floor: 1,
        inventory: state.inventory,
        onInspect() {}, onDisarm() {}, onTrapKit() {}, onOpen() {}, onSmash() {}, onLeave() {},
      });
      openEquipOverlay(0);

      const readSummary = (root) => {
        const summary = root.querySelector('.bag-capacity-summary');
        return {
          text: summary?.textContent || '',
          used: summary?.dataset.usedSlots,
          slots: summary?.querySelectorAll('.bag-slot').length || 0,
          occupied: summary?.querySelectorAll('.bag-slot.occupied').length || 0,
        };
      };
      return {
        item: readSummary(itemGrid),
        chest: readSummary(chestGrid),
        equip: readSummary(document.querySelector('#equip-overlay')),
        ownership: [...document.querySelectorAll('#equip-overlay .equip-bag-section .equip-item-row')]
          .map(row => row.dataset.ownership),
      };
    });

    expect(result.item).toMatchObject({ used: '3', slots: 20, occupied: 3 });
    expect(result.chest).toMatchObject({ used: '3', slots: 20, occupied: 3 });
    expect(result.equip).toMatchObject({ used: '3', slots: 20, occupied: 3 });
    expect(result.item.text).toContain('空き17枠');
    expect(result.ownership).toEqual(['town-confirmed', 'dungeon-unconfirmed']);
  });
}

test('trial knowledge is qualitative and does not expose an exact hidden affix value @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    state.party = [createSoloCharacter('Fighter')];
    state.inventory = [{
      kind: 'equipment', instanceId: 'trial-hidden-value', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 1, identified: false, knowledgeStage: 'trial',
      tags: ['blade'], hintTags: ['blade'], observedHintTags: [],
      affixes: [{ id: 'atk', type: 'atk', kind: 'support', value: 4.5 }],
    }];
    state.gameState = 'explore';
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row').click();
  const detail = await page.locator('.equip-detail-content').textContent();
  expect(detail).toContain('攻撃の手応え');
  expect(detail).not.toContain('4.5');
  expect(detail).not.toContain('atk');
});

test('equipped dungeon gear keeps its unconfirmed ownership badge @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const dungeonItem = {
      kind: 'equipment', instanceId: 'equipped-dungeon-unconfirmed', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 1, identified: false, knowledgeStage: 'discovery',
      tags: ['blade'], hintTags: ['blade'], observedHintTags: [], affixes: [],
    };
    state.party = [createSoloCharacter('Fighter')];
    state.party[0].equipment.weapon = dungeonItem;
    state.currentRun = {
      townInventory: [],
      unbankedObjectLoot: [{ id: 'loot-equipped-dungeon-unconfirmed', item: dungeonItem }],
      lostObjectLoot: [],
      materials: {},
    };
    state.inventory = [dungeonItem];
    state.gameState = 'explore';
    openEquipOverlay(0);
  });

  const equippedRow = page.locator('.equip-equipped-row[data-slot-id="weapon"]');
  await expect(equippedRow).toHaveAttribute('data-ownership', 'dungeon-unconfirmed');
  await expect(equippedRow.locator('.ownership-badge')).toContainText('迷宮で取得・未確定');
  await expect(equippedRow.locator('.equip-row-badge.equipped')).toHaveText('装備中');
});
