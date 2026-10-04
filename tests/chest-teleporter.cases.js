import { test, expect } from './fixtures/browser-health.js';
import { exploreMove } from './explore-input-helpers.js';

async function prepareTeleporterChest(page) {
  return page.evaluate(async () => {
    const { state, initNewGame, createStartingKitCharacter } = await import('/src/state.js');
    const { createDefaultCurrentRun } = await import('/src/state/initial_state.js');
    const { setupChestState } = await import('/src/chest.js');

    initNewGame();
    const character = createStartingKitCharacter('vanguard');
    character.name = 'Robin';
    character.hp = 30;
    character.maxHp = 30;
    character.status = 'ok';
    state.party = [character];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.buildSeedOffered = true; // the first ordinary chest otherwise offers the build seed
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
      // Exploration input lives on the world; it must take touches again.
      pointerEvents: getComputedStyle(document.querySelector('#dungeon-canvas')).pointerEvents,
      exploring: document.querySelector('#game-container').dataset.exploreHud !== undefined,
      originEvent: state.map[window.__chestOrigin.y][window.__chestOrigin.x].event,
    };
  }), { timeout: 5000 }).toEqual({
    gameState: 'explore',
    transitioning: false,
    hasChest: false,
    pointerEvents: 'auto',
    exploring: true,
    originEvent: null,
  });

  await exploreMove(page, 'turn-left');
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

test('a failed automatic disarm on a teleporter chest returns to usable exploration controls', async ({ page }) => {
  const origin = await prepareTeleporterChest(page);
  await page.evaluate((chestOrigin) => { window.__chestOrigin = chestOrigin; }, origin);
  await forceRandomSequence(page, [0.99, 0.10, 0, 0, 0, 0.99]);

  await page.getByRole('button', { name: '開ける', exact: true }).click();
  await expectExplorationReady(page, origin);
  expect(await page.evaluate(() => window.__stateModule.state.currentRun.trapsTriggered)).toBe(1);
});

test('a successful automatic disarm on a teleporter chest returns to usable exploration controls', async ({ page }) => {
  const origin = await prepareTeleporterChest(page);
  await page.evaluate((chestOrigin) => { window.__chestOrigin = chestOrigin; }, origin);
  await forceRandomSequence(page, [0, 0, 0, 0.99]);

  await page.getByRole('button', { name: '開ける', exact: true }).click();
  await expectExplorationReady(page, origin);
  expect(await page.evaluate(() => window.__stateModule.state.currentRun.trapsDisarmed)).toBe(1);
});
