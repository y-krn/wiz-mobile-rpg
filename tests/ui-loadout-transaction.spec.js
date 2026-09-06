import { test, expect } from './fixtures/browser-health.js';

test('loadout changes stay in a draft until one exploration-turn commit @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createSoloCharacter('Fighter');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'transaction-sword', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 1, identified: true, affixes: [],
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'transaction-ui' };
    state.gameState = 'explore';
    openEquipOverlay(0);
  });

  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { weapon: state.party[0].equipment.weapon, inventory: state.inventory, steps: state.currentRun.steps };
  })).toEqual({ weapon: 'DAGGER', inventory: [expect.any(Object)], steps: 0 });

  await expect(page.locator('#btn-equip-commit')).toBeEnabled();
  await expect(page.locator('#btn-equip-commit')).toContainText('探索時間が進む');
  await page.locator('#btn-equip-commit').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      weapon: state.party[0].equipment.weapon?.instanceId || state.party[0].equipment.weapon,
      returned: state.inventory.map(item => item?.instanceId || item),
      steps: state.currentRun.steps,
      floorSteps: state.currentRun.floorSteps['1'],
    };
  })).toEqual({
    weapon: 'transaction-sword',
    returned: ['DAGGER'],
    steps: 1,
    floorSteps: 1,
  });
});

test('canceling a dirty loadout draft leaves the live run untouched @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createSoloCharacter('Fighter');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = ['SHORT_SWORD'];
    state.currentRun = { steps: 4, floorSteps: { '1': 4 }, materials: {}, runSeed: 'cancel-ui' };
    state.gameState = 'explore';
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.getByRole('button', { name: 'キャンセル' }).first().click();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { weapon: state.party[0].equipment.weapon, inventory: state.inventory, steps: state.currentRun.steps };
  })).toEqual({ weapon: 'DAGGER', inventory: ['SHORT_SWORD'], steps: 4 });
});

test('unknown equipment uses an explicit irreversible trial action @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createSoloCharacter('Fighter');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = [{
      kind: 'equipment', instanceId: 'ui-unknown-trial', baseId: 'SHORT_SWORD',
      rarity: 'rare', level: 2, identified: false, halfIdentified: false,
      knowledgeStage: 'discovery', trialCount: 0, tags: ['blade'],
      hintTags: ['blade'], observedHintTags: [],
      curseEffectId: 'curse_blood_thirst', cursePower: 1, curseSuspected: true,
      affixes: []
    }];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'trial-ui' };
    state.gameState = 'explore';
    openEquipOverlay(0);
  });

  await page.locator('.equip-bag-section .equip-item-row', { hasText: '未鑑定の装備品' }).click();
  await expect(page.locator('.equip-detail-content')).toContainText('知識段階: 発見');
  await expect(page.getByRole('button', { name: '試す' })).toContainText('探索時間が進む');
  await page.getByRole('button', { name: '試す' }).click();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { weapon: state.party[0].equipment.weapon, steps: state.currentRun.steps };
  })).toEqual({ weapon: 'DAGGER', steps: 0 });

  await expect(page.locator('#btn-equip-commit')).toContainText('試す内容を確定する（探索時間が進む）');
  await page.getByRole('button', { name: '試す内容を確定する（探索時間が進む）' }).click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const item = state.party[0].equipment.weapon;
    return {
      item: item?.instanceId || item,
      knowledgeStage: item?.knowledgeStage,
      trialCount: item?.trialCount,
      curseLocked: item?.curseLocked,
      returned: state.inventory.map(value => value?.instanceId || value),
      steps: state.currentRun.steps
    };
  })).toEqual({
    item: 'ui-unknown-trial',
    knowledgeStage: 'trial',
    trialCount: 1,
    curseLocked: true,
    returned: ['DAGGER'],
    steps: 1
  });
});

test('committing outside exploration does not advance exploration time @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createSoloCharacter('Fighter');
    character.equipment.weapon = 'DAGGER';
    state.party = [character];
    state.inventory = ['SHORT_SWORD'];
    state.currentRun = { steps: 4, floorSteps: { '1': 4 }, materials: {}, runSeed: 'town-ui' };
    state.gameState = 'town';
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.locator('#btn-equip-commit').click();
  await expect(page.locator('#equip-overlay')).toBeHidden();
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      weapon: state.party[0].equipment.weapon,
      inventory: state.inventory,
      steps: state.currentRun.steps,
      floorSteps: state.currentRun.floorSteps['1'],
      gameState: state.gameState,
    };
  })).toEqual({
    weapon: 'SHORT_SWORD',
    inventory: ['DAGGER'],
    steps: 4,
    floorSteps: 4,
    gameState: 'town',
  });
});

test('committing a loadout consumes the normal exploration poison tick @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { openEquipOverlay } = await import('/src/equip.js');
    const character = createSoloCharacter('Fighter');
    character.equipment.weapon = 'DAGGER';
    character.hp = 10;
    character.status = 'poisoned';
    state.party = [character];
    state.inventory = ['SHORT_SWORD'];
    state.currentRun = { steps: 0, floorSteps: {}, materials: {}, runSeed: 'poison-ui' };
    state.floor = 1;
    state.gameState = 'explore';
    window.__loadoutTestRandom = Math.random;
    Math.random = () => 0;
    openEquipOverlay(0);
  });
  await page.locator('.equip-bag-section .equip-item-row', { hasText: 'ショートソード' }).click();
  await page.getByRole('button', { name: '装備する' }).click();
  await page.locator('#btn-equip-commit').click();
  const result = await page.evaluate(async () => {
    Math.random = window.__loadoutTestRandom;
    const { state } = await import('/src/state.js');
    return { hp: state.party[0].hp, steps: state.currentRun.steps };
  });
  expect(result).toEqual({ hp: 9, steps: 1 });
});
