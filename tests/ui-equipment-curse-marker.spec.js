import { test, expect } from './fixtures/browser-health.js';

// An identified curse shows in the equipment list itself, so the player does
// not have to open each item's detail. An unidentified curse stays hidden.

const cursedAmulet = (instanceId, identified) => ({
  kind: 'equipment',
  instanceId,
  baseId: 'VNEXT_AMULET',
  rarity: 'magic',
  level: 1,
  identified,
  enhanceLevel: 0,
  affixes: [{ type: 'hp', value: 3 }],
  tags: ['ward', 'curse'],
  curseEffectId: 'curse_blood_thirst',
  cursePower: 1,
  curseSuspected: true
});

test('identified cursed equipment is marked in the bag list without opening its detail', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async ({ identifiedItem, hiddenItem }) => {
    const { createDefaultCurrentRun, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { openEquipOverlay } = await import('/src/equip_ui.js');
    const { createDepartureCharacter } = await import('/src/systems/departure_preparation.js');
    initNewGame();
    state.party = [createDepartureCharacter('vanguard').character];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'equipment-curse-marker';
    state.currentRun.startingKit = 'vanguard';
    state.floor = 1;
    state.gameState = 'explore';
    state.inventory = [identifiedItem, hiddenItem];
    updateUI();
    openEquipOverlay(0);
  }, { identifiedItem: cursedAmulet('eq_cursed_known', true), hiddenItem: cursedAmulet('eq_cursed_hidden', false) });

  const rows = page.locator('.equip-bag-section .equip-item-row');
  await expect(rows).toHaveCount(2);
  const cursedRows = page.locator('.equip-bag-section .equip-item-row.is-cursed');
  await expect(cursedRows).toHaveCount(1);
  await expect(cursedRows.locator('.equip-curse-badge')).toHaveText('呪');
  await expect(cursedRows.locator('.equip-item-row-name')).not.toContainText('?');
  await expect(page.locator('.equip-bag-section .equip-curse-badge')).toHaveCount(1);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
