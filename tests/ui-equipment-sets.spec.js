import { test, expect } from './fixtures/browser-health.js';

// Equipment families (#2024): the equipment screen counts each family, says
// what the next piece would give, and three pieces switch the set effect on.

async function openEquipWithAmulet(page) {
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { openEquipOverlay } = await import('/src/equip_ui.js');
    const { createDepartureCharacter } = await import('/src/systems/departure_preparation.js');
    initNewGame();
    state.party = [createDepartureCharacter('vanguard').character];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'equipment-sets-ui';
    state.currentRun.startingKit = 'vanguard';
    state.floor = 1;
    state.gameState = 'explore';
    state.inventory = [{
      kind: 'equipment',
      instanceId: 'eq_set_amulet',
      baseId: 'VNEXT_AMULET',
      rarity: 'magic',
      level: 1,
      identified: true,
      enhanceLevel: 0,
      affixes: [{ type: 'hp', value: 3 }],
      tags: ['ward']
    }];
    updateUI();
    openEquipOverlay(0);
  });
}

const spellGuard = page => page.evaluate(async () => {
  const { state } = await import('/src/state.js');
  const { getCharAffixSum } = await import('/src/rules/item_rules.js');
  return getCharAffixSum(state.party[0], 'spellGuard');
});

test('The equipment screen counts each family and three pieces switch the set effect on', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openEquipWithAmulet(page);

  const strip = page.locator('[data-testid="equipment-sets"]');
  await expect(strip.locator('[data-set-id="iron"]')).toHaveText('鉄 1/3');
  await expect(strip.locator('[data-set-id="ward"]')).toHaveText('守勢 2/3 あと1つで魔除け+10%');
  await expect(strip.locator('[data-set-id="spirit"]')).toHaveText('霊 0/3');
  await expect(strip.locator('[data-set-id="ambush"]')).toHaveText('奇襲 1/3');
  await expect(strip.locator('[data-set-active="true"]')).toHaveCount(0);
  expect(await spellGuard(page)).toBe(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Selecting the amulet says what equipping it does to the families.
  await page.locator('.equip-bag-section .equip-item-row').first().click();
  await expect(page.locator('[data-testid="equipment-set-change"]')).toHaveText('系統: 守勢 2→3/3 そろう（魔除け+10%）');
  await page.getByRole('button', { name: '装備する' }).click();
  await expect(strip.locator('[data-set-id="ward"]')).toHaveText('守勢 3/3 魔除け+10%');
  await expect(strip.locator('[data-set-id="ward"]')).toHaveAttribute('data-set-active', 'true');

  await page.locator('#btn-equip-close').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await spellGuard(page)).toBe(10);
  await expect(page.locator('#log-content')).toContainText('系統「守勢」が3つそろった（魔除け+10%）。');
});

test('Taking a piece off breaks the set and says so', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openEquipWithAmulet(page);
  await page.locator('.equip-bag-section .equip-item-row').first().click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.locator('#btn-equip-close').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await spellGuard(page)).toBe(10);

  await page.evaluate(async () => {
    (await import('/src/equip_ui.js')).openEquipOverlay(0);
  });
  await page.locator('.equip-equipped-row[data-slot-id="shield"]').click();
  await expect(page.locator('[data-testid="equipment-set-change"]'))
    .toHaveText('系統: 守勢 3→2/3 崩れる（魔除け+10%が消える）・奇襲 1→0/3');
  await page.getByRole('button', { name: '外す' }).click();
  await expect(page.locator('[data-testid="equipment-sets"] [data-set-id="ward"]')).toHaveText('守勢 2/3 あと1つで魔除け+10%');
  await page.locator('#btn-equip-close').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await spellGuard(page)).toBe(0);
  await expect(page.locator('#log-content')).toContainText('系統「守勢」のそろいが崩れた（魔除け+10%が消えた）。');
});
