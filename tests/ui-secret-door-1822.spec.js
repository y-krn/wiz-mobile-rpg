import { test, expect } from './fixtures/browser-health.js';

// Secret doors (#1822): the wall the discovery line names is the wall that
// opens, and a passage hidden beside stairs can be searched from the stairs.

const DIRECTION_NAMES = ['北', '東', '南', '西'];

async function seedFloor(page, seed, floor) {
  return page.evaluate(async ({ seed, floor }) => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = seed;
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.deepestFloor = floor;
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = floor;
    state._freshRunFloor = floor;
    const grid = ensureRunFloor(state, floor);
    state.repelTurns = 999;
    state.gameState = 'explore';
    state.transitioning = false;
    updateUI();
    const doors = [];
    grid.forEach((row, y) => row.forEach((cell, x) => cell.secretDoor.forEach((hidden, dir) => {
      if (hidden && !cell.secretFound[dir]) doors.push({ x, y, dir, type: cell.type });
    })));
    return doors;
  }, { seed, floor });
}

// Stand at a door, search until it is found, then walk the way the line says.
async function revealAndWalk(page, door, facing) {
  return page.evaluate(async ({ door, facing, names }) => {
    const { state } = await import('/src/state.js');
    const { handleExploreAction } = await import('/src/menu/explore_actions.js');
    const { handleMove } = await import('/src/movement.js');
    const DX = [0, 1, 0, -1];
    const DY = [-1, 0, 1, 0];
    Object.assign(state, { x: door.x, y: door.y, dir: facing, repelTurns: 999, transitioning: false, gameState: 'explore', logs: [] });
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      handleExploreAction('search');
    } finally {
      Math.random = originalRandom;
    }
    const line = state.logs.find(entry => String(entry).includes('隠し扉を見つけた')) || '';
    const named = names.findIndex(name => line.includes(`${name}の壁`));
    if (named < 0) return { line, named, moved: false };
    state.dir = named;
    const before = { x: state.x, y: state.y };
    handleMove('forward');
    await new Promise(resolve => setTimeout(resolve, 450));
    const moved = state.x === before.x + DX[named] && state.y === before.y + DY[named];
    Object.assign(state, { transitioning: false, gameState: 'explore', activeTrapState: null });
    return { line, named, moved };
  }, { door, facing, names: DIRECTION_NAMES });
}

test('The wall named by the discovery line is the wall that opens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');

  let walked = 0;
  for (const [seed, floor] of [['secret-door-a', 1], ['secret-door-a', 2], ['secret-door-b', 6]]) {
    const doors = (await seedFloor(page, seed, floor)).filter(door => !door.type.startsWith('stairs'));
    expect(doors.length, `${seed} B${floor}F has secret doors`).toBeGreaterThan(0);
    // Facing the door, and facing away from it: the line names the wall either way.
    for (const [index, door] of doors.slice(0, 4).entries()) {
      const result = await revealAndWalk(page, door, (door.dir + index) % 4);
      // The far side of a door already opened in this loop is no longer hidden.
      if (!result.line) continue;
      // A cell can hide more than one passage; the search finds the first in
      // its order. Whichever it names must be one of this cell's, and open.
      const hiddenHere = doors.filter(entry => entry.x === door.x && entry.y === door.y).map(entry => entry.dir);
      expect(hiddenHere, `${seed} B${floor}F (${door.x},${door.y}): ${result.line}`).toContain(result.named);
      expect(result.moved, `${seed} B${floor}F (${door.x},${door.y}): ${result.line}`).toBe(true);
      walked++;
    }
  }
  expect(walked).toBeGreaterThanOrEqual(6);
});

test('A passage hidden beside the down stairs is searched from the stairs menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');

  // probe-5 B1F: the down stairs at (15,4) hide a passage in their east wall,
  // and the room behind it has no other way in.
  const doors = await seedFloor(page, 'probe-5', 1);
  const door = doors.find(entry => entry.type === 'stairs-down');
  expect(door).toBeTruthy();

  const openStairs = () => page.evaluate(async ({ door }) => {
    const { state } = await import('/src/state.js');
    const { handleExploreAction } = await import('/src/menu/explore_actions.js');
    Object.assign(state, { x: door.x, y: door.y, dir: 0, transitioning: false, gameState: 'explore' });
    handleExploreAction('search');
  }, { door });

  await openStairs();
  const searchWalls = page.locator('[data-stairs-search-walls]');
  await expect(searchWalls).toHaveText('あたりの壁を調べる');
  await expect(page.getByRole('button', { name: /へ降りる$/ })).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !isControlsGuarded();
  })).toBe(true);
  await page.evaluate(() => { window.__realRandom = Math.random; Math.random = () => 0; });
  await searchWalls.click();
  await page.evaluate(() => { Math.random = window.__realRandom; });

  const after = await page.evaluate(async ({ door }) => {
    const { state } = await import('/src/state.js');
    return {
      wall: state.map[door.y][door.x].walls[door.dir],
      found: state.map[door.y][door.x].secretFound[door.dir],
      line: state.logs.find(entry => String(entry).includes('隠し扉を見つけた')) || '',
      gameState: state.gameState,
    };
  }, { door });
  expect(after.line).toContain(`${DIRECTION_NAMES[door.dir]}の壁に隠し扉を見つけた`);
  expect(after).toMatchObject({ wall: false, found: true, gameState: 'explore' });

  // Nothing is left to find: the stairs menu is back to its usual choices.
  await openStairs();
  await expect(page.getByRole('button', { name: /へ降りる$/ })).toBeVisible();
  await expect(searchWalls).toHaveCount(0);
});

test('A passage hidden beside the entrance stairs is searched in place', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');

  // probe-6 B4F: the entrance stairs hide a passage in one of their walls.
  const doors = await seedFloor(page, 'probe-6', 4);
  const door = doors.find(entry => entry.type === 'stairs-up');
  expect(door).toBeTruthy();
  const result = await revealAndWalk(page, door, door.dir);
  expect(result.named).toBe(door.dir);
  expect(result.moved).toBe(true);

  // With nothing hidden, searching there reports the collapsed stairs again.
  const line = await page.evaluate(async ({ door }) => {
    const { state } = await import('/src/state.js');
    const { handleExploreAction } = await import('/src/menu/explore_actions.js');
    Object.assign(state, { x: door.x, y: door.y, transitioning: false, gameState: 'explore', logs: [] });
    handleExploreAction('search');
    return state.logs.at(-1);
  }, { door });
  expect(line).toContain('上り階段は崩れ');
});
