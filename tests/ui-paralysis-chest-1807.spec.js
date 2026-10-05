import { test, expect } from './fixtures/browser-health.js';

// Fountain paralysis (#1807): it used to stay until a fight, and a chest's
// buttons looked usable but did nothing. Now the chest says why it cannot be
// opened, and the paralysis wears off after a few exploration steps.

async function seedExplore(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async () => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'paralysis-chest-1807';
    state.currentRun.startingKit = 'vanguard';
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = 1;
    state._freshRunFloor = 1;
    const grid = ensureRunFloor(state, 1);
    // initNewGame leaves a position that may lie outside this floor: stand at
    // its entrance.
    const entranceY = grid.findIndex(row => row.some(cell => cell.type === 'stairs-up'));
    state.y = entranceY;
    state.x = grid[entranceY].findIndex(cell => cell.type === 'stairs-up');
    state.dir = 0;
    state.repelTurns = 999;
    state.encounterQuietSteps = 99;
    state.gameState = 'explore';
    state.transitioning = false;
    updateUI();
  });
}

async function openChest(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openChestMenu } = await import('/src/chest.js');
    state.chestState = {
      x: state.x,
      y: state.y,
      trap: 'none',
      trapSign: 'none',
      trapSignAccuracy: 0.9,
      item: 'HEAL_POTION',
      lootHint: { label: '消耗品または反応なし', aura: 'weak' },
    };
    state.gameState = 'combat';
    openChestMenu();
  });
  await expect(page.locator('#submenu-title')).toHaveText('宝箱');
}

test('A paralyzed adventurer sees why the chest cannot be opened, and walking it off frees the chest', async ({ page }) => {
  await seedExplore(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { applyStatusEffect, STATUS_EFFECT_IDS } = await import('/src/combat_logic/status_effects.js');
    applyStatusEffect(state.party[0], STATUS_EFFECT_IDS.PARALYZED, { remainingTurns: 3, source: 'spring' });
  });

  await openChest(page);
  await expect(page.locator('.chest-opener-blocked'))
    .toHaveText('体がしびれていて、宝箱に手を出せない。しばらく歩けば、しびれは取れる。');
  await expect(page.locator('#btn-chest-open')).toBeDisabled();
  await expect(page.locator('#btn-chest-leave')).toBeEnabled();
  await page.locator('#btn-chest-leave').click();

  // Three exploration turns later the numbness is gone.
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { consumeExplorationTurn } = await import('/src/movement.js');
    const statuses = [];
    for (let turn = 0; turn < 3; turn++) {
      consumeExplorationTurn();
      statuses.push(state.party[0].status);
    }
    return { statuses, logs: state.logs.slice(-6) };
  });
  expect(after.statuses).toEqual(['paralyzed', 'paralyzed', 'ok']);
  expect(after.logs.join('\n')).toContain('のしびれが取れた。');

  await openChest(page);
  await expect(page.locator('.chest-opener-blocked')).toHaveCount(0);
  await expect(page.locator('#btn-chest-open')).toBeEnabled();
});

test('The fountain paralysis carries a step count and says it will pass', async ({ page }) => {
  await seedExplore(page);
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.map[state.y][state.x].event = 'event_spring';
    openSubmenu('event_spring', '泉');
    const originalRandom = Math.random;
    // 0.9 lands in the paralysis band (0.85 and up) and picks the only adventurer.
    Math.random = () => 0.9;
    try {
      [...document.querySelectorAll('#submenu-options button')].find(button => button.textContent === '泉の水を飲む').click();
    } finally {
      Math.random = originalRandom;
    }
    const hero = state.party[0];
    return {
      status: hero.status,
      steps: hero.paralyzeTurns,
      source: hero.statusEffects?.paralyzed?.source,
      logs: state.logs.slice(-3),
    };
  });
  expect(result.status).toBe('paralyzed');
  expect(result.steps).toBeGreaterThanOrEqual(5);
  expect(result.steps).toBeLessThanOrEqual(8);
  expect(result.source).toBe('spring');
  expect(result.logs.join('\n')).toContain('しびれは、しばらく歩けば取れるだろう。');
});
