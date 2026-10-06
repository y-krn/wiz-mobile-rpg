import { test, expect } from './fixtures/browser-health.js';

// Unresolved observations (#1821): a sensed chest stopped being "未解決" only
// on the next free step, so the tag stayed up on the chest itself, through
// its menu, and after it was opened.

// A 9x9 map with one corridor running north from the start cell (4,4).
function makeCorridorMap() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false],
    type: 'empty',
  })));
  for (let y = 4; y > 1; y--) {
    map[y][4].walls[0] = false;
    map[y - 1][4].walls[2] = false;
  }
  return map;
}

async function seedCorridor(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ map }) => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row, y) => row.map((_, x) => x === 4 && y === 4));
    state.mapRevision = (state.mapRevision || 0) + 1;
    Object.assign(state, { x: 4, y: 4, dir: 0, roamingMonsters: [], repelTurns: 999, encounterQuietSteps: 99 });
    state.gameState = 'explore';
    state.transitioning = false;
    state.logs = [];
    updateUI();
    (await import('/src/renderer.js')).dungeonRenderer.draw();
  }, { map: makeCorridorMap() });
}

async function stepForward(page) {
  await page.evaluate(async () => {
    const { handleMove } = await import('/src/movement.js');
    handleMove('forward');
  });
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.transitioning;
  })).toBe(false);
}

const unresolved = page => page.locator('#log-content [data-event-kind="unresolved"]');

test('A sensed chest is no longer unresolved once the adventurer stands at it', async ({ page }) => {
  await seedCorridor(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.map[2][4].event = 'chest';
  });

  // One step north: the chest is sensed from the next cell.
  await stepForward(page);
  await expect(unresolved(page)).toHaveCount(1);
  await expect(unresolved(page)).toContainText('【気配】');
  const key = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return Object.values(state.currentRun.eventObservations).find(entry => entry.lifecycle === 'active')?.key;
  });
  expect(key).toBe('aura:1:chest:4:2');

  // On the chest itself: the menu is open and nothing is left unresolved.
  await stepForward(page);
  await expect(page.locator('#submenu-title')).toHaveText('宝箱');
  await expect(unresolved(page)).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.currentRun.eventObservations['aura:1:chest:4:2'].lifecycle;
  })).toBe('resolved');

  // Walking away from a chest that was left unopened does not raise it again.
  await expect.poll(async () => page.evaluate(async () => {
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !isControlsGuarded();
  })).toBe(true);
  await page.locator('#btn-chest-leave').click();
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { handleMove } = await import('/src/movement.js');
    state.transitioning = false;
    handleMove('turn-around');
  });
  await stepForward(page);
  await expect(unresolved(page)).toHaveCount(0);
});

test('A trap trace is unresolved only while the trap is the next step', async ({ page }) => {
  await seedCorridor(page);
  await page.evaluate(async () => {
    const { state, addEventLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    // A discovered trap one step west of the corridor's first cell.
    state.map[4][3].trap = { id: 'trace-1821', type: 'damage', state: 'discovered', floorId: 'B1', difficulty: 20, position: { x: 3, y: 4 } };
    addEventLog('【痕跡】隣接する床に罠の気配がある。', { key: 'trap:1:3:4', scope: 'trap:1' });
    updateUI();
  });
  await expect(unresolved(page)).toHaveCount(1);

  await stepForward(page);
  await stepForward(page);
  await expect(unresolved(page)).toHaveCount(0);
});
