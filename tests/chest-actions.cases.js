import { test, expect } from './fixtures/browser-health.js';

test('Chest actions resolve directly with the sole eligible character @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 13 width
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();

  // 1. Initial State Setup (No trap: direct opening is deterministic)
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    
    state.party = [
      {
        name: "Robin",
        level: 1,
        hp: 100,
        maxHp: 100,
        status: "ok",
        equipment: { weapon: null, shield: null, armor: null }
      }
    ];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.buildSeedOffered = true; // the first ordinary chest otherwise offers the build seed
    state.gameState = 'explore';
    // Force transition to chest menu
    setupChestState("none", null, "HEAL_POTION");
  });

  // 2. One tap opens the chest; no actor-selection submenu is rendered.
  // A reward that fits the bag goes straight in without a resolution screen (#1835).
  await page.locator('#btn-chest-open').click();
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    return {
      gameState: state.gameState,
      transitioning: state.transitioning,
      hasChest: Boolean(state.chestState),
      menuType: menuContext.type,
      potionCount: state.inventory.filter(item => item === 'HEAL_POTION').length,
      pending: Boolean(state.currentRun?.pendingRewardBundle),
    };
  })).toEqual({
      gameState: 'explore',
      transitioning: false,
      hasChest: false,
      menuType: '',
      potionCount: 1,
      pending: false,
    });
  await expect(page.getByText('宝箱を開けるキャラクターを選択：')).toHaveCount(0);
  await expect(page.locator('#loot-toast')).toBeVisible();

  // 3. A trapped chest disarms automatically on opening and returns to exploration.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    state.floor = 2;
    state.inventory = [];
    setupChestState('poison needle', null, 'HEAL_POTION');
  });
  await expect(page.locator('#btn-chest-inspect')).toHaveCount(0);
  await expect(page.locator('#btn-chest-disarm')).toHaveCount(0);
  await expect(page.locator('#btn-chest-smash')).toHaveCount(0);
  await expect(page.locator('.chest-trap-sign')).toContainText('罠の気配:');
  await expect(page.locator('.chest-disarm-chance')).toHaveText('開けるときに罠を外せる見込み: 約25%');
  await page.locator('#btn-chest-open').click();
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    return {
      gameState: state.gameState,
      transitioning: state.transitioning,
      hasChest: Boolean(state.chestState),
      menuType: menuContext.type,
      pending: Boolean(state.currentRun?.pendingRewardBundle),
    };
  }), { timeout: 5000 }).toEqual({
    gameState: 'explore',
    transitioning: false,
    hasChest: false,
    menuType: '',
    pending: false,
  });

});

test('A trap kit opens a trapped chest without firing the trap @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();

  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    state.party = [{
      name: 'Robin',
      level: 1,
      hp: 15,
      maxHp: 15,
      status: 'ok',
      equipment: { weapon: null, shield: null, armor: null },
    }];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.buildSeedOffered = true; // the first ordinary chest otherwise offers the build seed
    state.floor = 2;
    state.inventory = ['TRAP_KIT'];
    setupChestState('poison needle', null, 'HEAL_POTION');
  });

  await page.getByRole('button', { name: 'キットを使って開ける' }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      hasChest: Boolean(state.chestState),
      hp: state.party[0].hp,
      kits: state.inventory.filter(item => item === 'TRAP_KIT').length,
      potions: state.inventory.filter(item => item === 'HEAL_POTION').length,
    };
  })).toEqual({ hasChest: false, hp: 15, kits: 0, potions: 1 });
});

test('Opening a chest with stale state leaves the chest menu usable @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');

    state.party = [{
      name: 'Robin',
      level: 1,
      hp: 15,
      maxHp: 15,
      status: 'ok',
      equipment: { weapon: null, shield: null, armor: null },
    }];
    setupChestState('none', null, 'HEAL_POTION');
  });

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.chestState = null;
  });
  await page.locator('#btn-chest-open').click();

  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    return {
      gameState: state.gameState,
      transitioning: state.transitioning,
      hasChest: Boolean(state.chestState),
      menuType: menuContext.type,
    };
  })).toEqual({
    gameState: 'submenu',
    transitioning: false,
    hasChest: false,
    menuType: 'chest_menu',
  });
  await expect(page.locator('#controls-panel')).toHaveCSS('pointer-events', 'auto');
});
