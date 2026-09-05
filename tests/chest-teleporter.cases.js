import { test, expect } from './fixtures/browser-health.js';

async function prepareTeleporterChest(page) {
  return page.evaluate(async () => {
    const { state, initNewGame, createSoloCharacter } = await import('/src/state.js');
    const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
    const { setupChestState } = await import('/src/chest.js');

    initNewGame();
    const character = createSoloCharacter('Fighter');
    character.name = 'Robin';
    character.hp = 30;
    character.maxHp = 30;
    character.status = 'ok';
    state.party = [character];
    state.currentRun = createDefaultCurrentRun();
    state.map[state.y][state.x].event = 'chest';
    const origin = { x: state.x, y: state.y };
    setupChestState('teleporter', null, null);
    return origin;
  });
}

async function forceRandomSequence(page, values) {
  await page.evaluate((randomValues) => {
    const originalRandom = Math.random;
    let index = 0;
    window.__restoreTestRandom = () => {
      Math.random = originalRandom;
      delete window.__restoreTestRandom;
    };
    Math.random = () => randomValues[index++] ?? 0.99;
  }, values);
}

async function restoreRandom(page) {
  await page.evaluate(() => window.__restoreTestRandom?.());
}

async function expectExplorationReady(page, origin) {
  await expect.poll(async () => page.evaluate(() => {
    const { state } = window.__stateModule;
    return {
      gameState: state.gameState,
      transitioning: state.transitioning,
      hasChest: Boolean(state.chestState),
      pointerEvents: getComputedStyle(document.querySelector('#controls-panel')).pointerEvents,
      originEvent: state.map[window.__chestOrigin.y][window.__chestOrigin.x].event,
    };
  }), { timeout: 5000 }).toEqual({
    gameState: 'explore',
    transitioning: false,
    hasChest: false,
    pointerEvents: 'auto',
    originEvent: null,
  });

  await page.getByRole('button', { name: '左を向く' }).click();
  await expect.poll(async () => page.evaluate(() => window.__stateModule.state.dir)).toBe(3);
  void origin;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();
  await page.evaluate(async () => {
    window.__stateModule = await import('/src/state.js');
  });
});

test.afterEach(async ({ page }) => {
  await restoreRandom(page);
});

test('smashing a teleporter chest returns to usable exploration controls', async ({ page }) => {
  const origin = await prepareTeleporterChest(page);
  await page.evaluate((chestOrigin) => { window.__chestOrigin = chestOrigin; }, origin);
  await forceRandomSequence(page, [0.50, 0.10, 0, 0, 0, 0.99]);

  await page.getByRole('button', { name: '叩き壊す' }).click();
  await expectExplorationReady(page, origin);
});

test('smashing an interrupted teleporter chest still returns to usable exploration controls', async ({ page }) => {
  const origin = await prepareTeleporterChest(page);
  await page.evaluate((chestOrigin) => { window.__chestOrigin = chestOrigin; }, origin);
  await forceRandomSequence(page, [0.49, 0, 0, 0.99]);

  await page.getByRole('button', { name: '叩き壊す' }).click();
  await expectExplorationReady(page, origin);
});
