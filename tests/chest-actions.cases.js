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
    const { state } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    
    state.party = [
      {
        name: "Robin",
        class: "Thief",
        level: 1,
        hp: 100,
        maxHp: 100,
        status: "ok",
        equipment: { weapon: null, shield: null, armor: null }
      }
    ];
    // Force transition to chest menu
    setupChestState("none", null, "HEAL_POTION");
  });

  // 2. One tap opens the chest; no actor-selection submenu is rendered.
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
    };
  })).toEqual({
    gameState: 'explore',
    transitioning: false,
    hasChest: false,
    menuType: 'chest_result',
    potionCount: 1,
  });
  await expect(page.getByText('宝箱を開けるキャラクターを選択：')).toHaveCount(0);

  // 3. A trapped chest enters disarm resolution directly from the chest menu.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { setupChestState, openChestMenu } = await import('/src/chest.js');
    setupChestState('poison needle', null, 'HEAL_POTION');
    state.chestState.inspected = true;
    state.chestState.identifiedTrap = 'poison needle';
    openChestMenu();
  });
  await page.locator('#btn-chest-disarm').click();
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    return { phase: state.chestState?.phase, menuType: menuContext.type };
  })).toEqual({ phase: 'resolving', menuType: 'chest_menu' });
  await expect(page.getByText('罠を解除するキャラクターを選択：')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { gameState: state.gameState, transitioning: state.transitioning, hasChest: Boolean(state.chestState) };
  }), { timeout: 5000 }).toEqual({ gameState: 'explore', transitioning: false, hasChest: false });

});

test('Chest inspection reports when no trap needs disarming @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 13 width
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();

  // 1. Initial State Setup (No trap: none)
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { setupChestState } = await import('/src/chest.js');
    
    state.party = [
      {
        name: "Robin",
        class: "Thief",
        level: 1,
        hp: 15,
        maxHp: 15,
        status: "ok",
        equipment: { weapon: null, shield: null, armor: null }
      }
    ];
    // Force transition to chest menu
    setupChestState("none", 100, null);
  });

  // 2. Before Inspection UI verification
  const btnInspect = page.locator('#btn-chest-inspect');
  const btnDisarm = page.locator('#btn-chest-disarm');

  await expect(btnInspect).toBeVisible();
  await expect(btnInspect).toBeEnabled();

  await expect(btnDisarm).toBeVisible();
  await expect(btnDisarm).toHaveText("解除（要調査）");
  await expect(btnDisarm).toBeDisabled();

  // 3. Perform inspection
  await btnInspect.click();

  // 4. After Inspection UI verification
  const btnInspectAfter = page.locator('#btn-chest-inspect');
  await expect(btnInspectAfter).toBeVisible();
  await expect(btnInspectAfter).toBeDisabled();

  const identifiedTrap = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.chestState.identifiedTrap;
  });

  // Find the disarm button again
  const btnDisarmAfter = page.locator('#btn-chest-disarm');
  const disarmText = await btnDisarmAfter.textContent();
  console.log(`Disarm button text after inspection (no trap case): ${disarmText}`);

  if (identifiedTrap === "none") {
    await expect(btnDisarmAfter).toHaveText("解除不要");
    await expect(btnDisarmAfter).toBeDisabled();
  } else {
    await expect(btnDisarmAfter).toHaveText("解除する");
    await expect(btnDisarmAfter).toBeEnabled();
  }

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
      class: 'Thief',
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
