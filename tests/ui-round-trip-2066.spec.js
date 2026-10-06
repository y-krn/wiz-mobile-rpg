import { test, expect } from './fixtures/browser-health.js';

// Round-trip prototype (#2066): an opt-in rule where the dungeon is five
// floors, there is no Portal at the bottom, and the way home is back up the
// stairs. Turning back wakes the dungeon and a hunter follows from below.

async function startRun(page, { roundTrip }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /鋼の前線キット/ }).first().click();
  await page.locator('#btn-kit-confirm').click();
  const rule = page.locator('.solo-start-rule-option');
  await expect(rule).toHaveAttribute('aria-pressed', 'false');
  if (roundTrip) {
    await rule.click();
    await expect(page.locator('.solo-start-rule-option')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.solo-start-rule-option')).toContainText('往復の試作：使う');
    await expect(page.locator('.solo-preparation-round-trip')).toContainText('往復の試作');
  }
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  // Fights and traps are not what these tests are about.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.repelTurns = 999;
    state.encounterQuietSteps = 999;
  });
}

// Stand on a cell of the current floor by its type and let the cell respond.
async function standOn(page, type) {
  await page.evaluate(async (cellType) => {
    const { state } = await import('/src/state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    const y = state.map.findIndex(row => row.some(cell => cell.type === cellType));
    state.y = y;
    state.x = state.map[y].findIndex(cell => cell.type === cellType);
    checkCellEvents();
  }, type);
}

// Wait inside the page until the floor change (a timed transition) has landed.
async function waitForFloor(page, floor) {
  await page.evaluate(async (target) => {
    const { state } = await import('/src/state.js');
    await new Promise(resolve => {
      const timer = setInterval(() => {
        if (state.floor === target && !state.transitioning) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  }, floor);
}

async function goToFloor(page, floor, direction) {
  await page.evaluate(async ({ target, way }) => {
    const movement = await import('/src/movement.js');
    if (way === 'down') movement.descendToFloor(target);
    else movement.ascendToFloor(target);
  }, { target: floor, way: direction });
  await waitForFloor(page, floor);
}

async function logText(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.logs.map(entry => (typeof entry === 'string' ? entry : entry.text || entry.message || '')).join('\n');
  });
}

async function passActions(page, count) {
  await page.evaluate(async (n) => {
    const { handleMove } = await import('/src/movement.js');
    for (let i = 0; i < n; i++) handleMove(i % 2 === 0 ? 'turn-left' : 'turn-right');
  }, count);
}

test('An ordinary run still has one-way stairs and no round-trip state', async ({ page }) => {
  await startRun(page, { roundTrip: false });
  await standOn(page, 'stairs-up');
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      roundTrip: state.currentRun.roundTrip,
      gameState: state.gameState,
      lastLog: state.logs.at(-1),
    };
  });
  expect(result.roundTrip).toBeNull();
  expect(result.gameState).toBe('explore');
  expect(JSON.stringify(result.lastLog)).toContain('上り階段は崩れ');
});

test('A round-trip run climbs back to the floor it left, is hunted, and walks out at the top', async ({ page }) => {
  await startRun(page, { roundTrip: true });
  expect(await logText(page)).toContain('往復の試作');

  // Leave a mark on the first floor, go down, and come back up.
  const before = await page.evaluate(async () => {
    const { state, markMapCellVisited } = await import('/src/state.js');
    const y = state.map.findIndex(row => row.some(cell => cell.type === 'stairs-down'));
    const x = state.map[y].findIndex(cell => cell.type === 'stairs-down');
    markMapCellVisited(x, y);
    return { visited: state.visitedMaps[0].flat().filter(Boolean).length, stairsDown: { x, y }, awake: state.currentRun.roundTrip.awake };
  });
  expect(before.awake).toBe(false);
  await goToFloor(page, 2, 'down');

  await standOn(page, 'stairs-up');
  await expect(page.locator('#submenu-title')).toHaveText('崩れた坑道（地下1階）への上り階段');
  await expect(page.locator('[data-testid="stairs-up-note"]')).toContainText('迷宮が目を覚まし');
  // The menu ignores taps for a moment after it opens: retry until the climb starts.
  await expect(async () => {
    await page.locator('[data-stairs-up="ascend"]').click({ timeout: 1000 });
    expect(await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return state.transitioning || state.floor === 1;
    })).toBe(true);
  }).toPass();
  await waitForFloor(page, 1);

  const back = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      position: { x: state.x, y: state.y },
      visited: state.visitedMaps[0].flat().filter(Boolean).length,
      roundTrip: state.currentRun.roundTrip,
      hunters: state.roamingMonsters.filter(monster => monster.hunter).length,
    };
  });
  expect(back.position).toEqual(before.stairsDown);
  expect(back.visited).toBeGreaterThanOrEqual(before.visited);
  expect(back.roundTrip.awake).toBe(true);
  expect(back.roundTrip.hunterEntry).toEqual(before.stairsDown);
  expect(back.hunters).toBe(0);
  expect(await logText(page)).toContain('迷宮が目を覚ました');
  expect(await page.evaluate(async () => (await import('/src/ui/ui_root.js')).getCurrentGoal()))
    .toBe('上り階段から地上へ出る');

  // Walk to the way out; the hunter steps out of the stairs behind and closes in.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const y = state.map.findIndex(row => row.some(cell => cell.type === 'stairs-up'));
    state.y = y;
    state.x = state.map[y].findIndex(cell => cell.type === 'stairs-up');
  });
  await passActions(page, 8);
  const hunted = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const hunter = state.roamingMonsters.find(monster => monster.hunter);
    return hunter ? { floor: hunter.floor, x: hunter.x, y: hunter.y, kind: hunter.kind } : null;
  });
  expect(hunted).not.toBeNull();
  expect(hunted.floor).toBe(1);
  expect(hunted.kind).toBe('elite');
  expect(await logText(page)).toContain('下の階から上がってきた');

  await passActions(page, 8);
  const closer = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const hunter = state.roamingMonsters.find(monster => monster.hunter);
    return { x: hunter.x, y: hunter.y };
  });
  expect(closer).not.toEqual({ x: hunted.x, y: hunted.y });

  // A reload keeps the way back: the floor, the woken dungeon and the hunter.
  await page.evaluate(async () => (await import('/src/state.js')).saveAutosave());
  await page.reload();
  await expect(page.locator('#explore-controls')).toBeVisible();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.repelTurns = 999;
    state.encounterQuietSteps = 999;
    return {
      floor: state.floor,
      awake: state.currentRun.roundTrip?.awake,
      hunters: state.roamingMonsters.filter(monster => monster.hunter).length,
    };
  });
  expect(resumed).toEqual({ floor: 1, awake: true, hunters: 1 });

  await standOn(page, 'stairs-up');
  await expect(page.locator('#submenu-title')).toHaveText('地上への上り階段');
  await expect(async () => {
    await page.locator('[data-stairs-up="surface"]').click({ timeout: 1000 });
    await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.locator('[data-result-outcome="surface"]')).toContainText('歩いて地上へ帰還');
  const ended = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { reason: state.runHistory[0].returnReason, outcome: state.runHistory[0].outcome };
  });
  expect(ended).toEqual({ reason: 'surface', outcome: 'retreat' });
});

test('The bottom floor gives the treasure, closes the way down and silences the Portal', async ({ page }) => {
  await startRun(page, { roundTrip: true });
  await goToFloor(page, 5, 'down');

  const taken = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { applyPendingOutcomeRewards } = await import('/src/combat_ui/outcome_rewards.js');
    const lines = applyPendingOutcomeRewards(state, { kind: 'milestoneVictory', floor: 5 });
    return { lines, roundTrip: state.currentRun.roundTrip, defeated: state.currentRun.defeatedMilestones };
  });
  expect(taken.lines.join(' ')).toContain('迷宮の至宝を手に入れた');
  expect(taken.roundTrip.treasure).toBe(true);
  expect(taken.roundTrip.awake).toBe(true);
  expect(taken.defeated).toContain(5);

  await standOn(page, 'stairs-down');
  await expect(page.locator('[data-testid="stairs-round-trip-note"]')).toContainText('上り階段を歩いて地上へ戻る');
  await expect(page.getByRole('button', { name: 'この先の道はまだ開いていない' })).toBeDisabled();
  // The menu ignores taps for a moment after it opens: retry until it closes.
  await expect(async () => {
    await page.getByRole('button', { name: '降りずに進む' }).click({ timeout: 1000 });
    expect(await page.evaluate(async () => (await import('/src/state.js')).state.gameState)).toBe('explore');
  }).toPass();

  const portal = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { checkCellEvents } = await import('/src/movement.js');
    const y = state.map.findIndex(row => row.some(cell => cell.event === 'return_portal'));
    state.y = y;
    state.x = state.map[y].findIndex(cell => cell.event === 'return_portal');
    checkCellEvents();
    return { gameState: state.gameState, lastLog: JSON.stringify(state.logs.at(-1)) };
  });
  expect(portal.gameState).toBe('explore');
  expect(portal.lastLog).toContain('帰還の門は沈黙している');

  // This test jumped straight to the bottom; a real run has the floors above.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    (await import('/src/state/run_floor_state.js')).ensureRunFloor(state, 4);
  });
  await goToFloor(page, 4, 'up');
  expect(await logText(page)).not.toContain('undefined');
  const goal = await page.evaluate(async () => (await import('/src/ui/ui_root.js')).getCurrentGoal());
  expect(goal).toBe('至宝を持って地下3階へ戻る');
});
