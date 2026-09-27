import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };

// 9x9 cells; the start cell (4,4) faces north with the north wall closed and
// the south wall open, so it is a dead end the player has to turn away from.
function makeDeadEndMap() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false],
    type: 'empty',
  })));
  map[4][4].walls[2] = false;
  map[5][4].walls[0] = false;
  return map;
}

async function seedDeadEnd(page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async (map) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    // Keep random encounters from interrupting the steps in and out of the dead end.
    Math.random = () => 0.99;
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = map;
    state.maps[0] = map;
    state.visitedMap = map.map(row => row.map(() => true));
    state.visitedMaps[0] = state.visitedMap;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.roamingMonsters = [];
    state.roamingMovementStepCount = 0;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
  }, makeDeadEndMap());
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      x: state.x,
      y: state.y,
      dir: state.dir,
      gameState: state.gameState,
      roamingSteps: state.roamingMovementStepCount,
    };
  });
}

test('Turn-around button faces back in one tap and backward still steps without turning at 390x844 @smoke', async ({ page }) => {
  await seedDeadEnd(page);
  const turnAround = page.locator('#btn-turn-around');
  await expect(turnAround).toBeVisible();
  await expect(turnAround).toHaveAttribute('aria-label', '後ろを向く');
  const box = await turnAround.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);

  // Backward keeps its step-back contract: position changes, facing does not.
  await page.locator('#btn-move-backward').click();
  expect(await snapshot(page)).toMatchObject({ x: 4, y: 5, dir: 0, gameState: 'explore' });
  await page.locator('#btn-move-forward').click();
  expect(await snapshot(page)).toMatchObject({ x: 4, y: 4, dir: 0 });

  const before = await snapshot(page);
  await turnAround.click();
  const after = await snapshot(page);
  expect(after).toMatchObject({ x: 4, y: 4, dir: 2, gameState: 'explore' });
  // Same world time as the two quarter turns it replaces.
  expect(after.roamingSteps - before.roamingSteps).toBe(2);

  // Now facing the open south side, forward leaves the dead end.
  await page.locator('#btn-move-forward').click();
  expect(await snapshot(page)).toMatchObject({ x: 4, y: 5, dir: 2 });

  await turnAround.click();
  expect(await snapshot(page)).toMatchObject({ x: 4, y: 5, dir: 0 });
});

test('Q key turns around once per press during exploration @smoke', async ({ page }) => {
  await seedDeadEnd(page);

  await page.keyboard.press('q');
  expect(await snapshot(page)).toMatchObject({ x: 4, y: 4, dir: 2 });
  await page.keyboard.press('q');
  expect(await snapshot(page)).toMatchObject({ x: 4, y: 4, dir: 0 });
});
