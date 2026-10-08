import { test, expect } from './fixtures/browser-health.js';

// Every run is a round trip (#2066, #2062): the dungeon is five floors, there
// is no Portal at the bottom, and the way home is back up the stairs.
// Turning back wakes the dungeon and a hunter follows from below.

async function startRun(page, { dungeon = 'collapsed_mine', setup = null } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  if (setup) await page.evaluate(setup);
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /鋼の前線キット/ }).first().click();
  await page.locator('#btn-kit-confirm').click();
  // There is no rule to choose.
  await expect(page.locator('.solo-start-rule-option')).toHaveCount(0);
  const destination = page.locator(`button.solo-start-floor-option[data-dungeon="${dungeon}"]`);
  if ((await destination.getAttribute('aria-pressed')) !== 'true') {
    await expect(async () => {
      await page.locator(`button.solo-start-floor-option[data-dungeon="${dungeon}"]`).click({ timeout: 1000 });
      await expect(page.locator(`button.solo-start-floor-option[data-dungeon="${dungeon}"]`)).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass();
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

test('Every run is a round trip: the first floor\'s up stairs lead out', async ({ page }) => {
  await startRun(page);
  expect(await logText(page)).toContain('帰還の門は無い');
  const roundTrip = await page.evaluate(async () => (await import('/src/state.js')).state.currentRun.roundTrip);
  expect(roundTrip).toMatchObject({ treasure: false, awake: false });
  await standOn(page, 'stairs-up');
  await expect(page.locator('#submenu-title')).toHaveText('地上への上り階段');
  await expect(page.locator('[data-stairs-up="surface"]')).toHaveText('地上へ出て冒険を終える');
});

test('A run climbs back to the floor it left, is hunted, and walks out at the top', async ({ page }) => {
  await startRun(page);

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

test('The way back shows how far behind the hunter is, from before it appears until it is right behind', async ({ page }) => {
  await startRun(page);
  await expect(page.locator('.hud-hunter')).toHaveCount(0);
  await goToFloor(page, 2, 'down');
  await goToFloor(page, 1, 'up');
  expect(await logText(page)).toContain('迷宮が目を覚ました');

  // Before it steps out: a countdown.
  const chip = page.locator('.hud-hunter');
  await expect(chip).toHaveAttribute('data-phase', 'arriving');
  await expect(chip).toHaveText(/：あと\d+手で現れる$/);

  // Stand well away along open corridors and let it come.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { mapHunterReach } = await import('/src/rules/round_trip.js');
    const { updateUI } = await import('/src/ui.js');
    const entry = state.currentRun.roundTrip.hunterEntry;
    const far = [...mapHunterReach(state.map, entry)].filter(([, cell]) => cell.distance >= 12 && cell.distance <= 16)[0];
    [state.x, state.y] = far[0].split(',').map(Number);
    updateUI();
  });
  await passActions(page, 7);
  await expect(chip).toHaveAttribute('data-phase', 'following');
  await expect(chip).toHaveText(/：あと\d+歩$/);
  await expect(chip).toHaveAttribute('data-level', '0');
  const first = Number(await chip.getAttribute('data-distance'));

  // It closes in while the run stands and turns: near, then right behind.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { handleMove } = await import('/src/movement.js');
    const { getHuntStatus } = await import('/src/systems/round_trip.js');
    for (let i = 0; i < 40 && getHuntStatus(state)?.distance > 3; i++) handleMove(i % 2 === 0 ? 'turn-left' : 'turn-right');
  });
  await expect(chip).toHaveAttribute('data-level', '2');
  expect(Number(await chip.getAttribute('data-distance'))).toBeLessThan(first);
  const log = await logText(page);
  expect(log).toContain('足音が近づいてくる');
  expect(log).toContain('すぐ後ろに迫っている');

  // On the up stairs it cannot follow; the chip says so.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const y = state.map.findIndex(row => row.some(cell => cell.type === 'stairs-up'));
    state.y = y;
    state.x = state.map[y].findIndex(cell => cell.type === 'stairs-up');
    updateUI();
  });
  await expect(chip).toHaveAttribute('data-phase', 'lost');
  await expect(chip).toContainText('こちらへ来られない');
});

test('The bottom floor gives the treasure, closes the way down, and has no Portal', async ({ page }) => {
  await startRun(page);
  await goToFloor(page, 5, 'down');
  const bottom = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const events = state.map.flat().map(cell => cell.event).filter(Boolean);
    return { portal: events.includes('return_portal'), boss: events.includes('boss'), merchant: events.includes('event_merchant') };
  });
  expect(bottom).toEqual({ portal: false, boss: true, merchant: true });

  const taken = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { applyPendingOutcomeRewards } = await import('/src/combat_ui/outcome_rewards.js');
    const y = state.map.findIndex(row => row.some(cell => cell.event === 'boss'));
    state.y = y;
    state.x = state.map[y].findIndex(cell => cell.event === 'boss');
    const lines = applyPendingOutcomeRewards(state, { kind: 'milestoneVictory', floor: 5 });
    return {
      lines,
      roundTrip: state.currentRun.roundTrip,
      defeated: state.currentRun.defeatedMilestones,
      // Nothing lies below: the guardian's cell does not become a way down.
      guardianCell: state.map[state.y][state.x].type
    };
  });
  expect(taken.guardianCell).not.toBe('stairs-down');
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

test('In the second dungeon the first floor\'s up stairs lead out too', async ({ page }) => {
  await startRun(page, {
    dungeon: 'forgotten_catacomb',
    setup: async () => {
      const { state } = await import('/src/state.js');
      state.unlockedMilestones = [5];
    }
  });
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.floor)).toBe(6);
  await standOn(page, 'stairs-up');
  await expect(page.locator('#submenu-title')).toHaveText('地上への上り階段');
  await expect(async () => {
    await page.locator('[data-stairs-up="surface"]').click({ timeout: 1000 });
    await expect(page.locator('#result-overlay')).toBeVisible({ timeout: 1000 });
  }).toPass();
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.runHistory[0].returnReason)).toBe('surface');
});

test('A Wing carries one person: the treasure and a keeper stay in the dungeon', async ({ page }) => {
  await startRun(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.currentRun.roundTrip.treasure = true;
    state.currentRun.defeatedMilestones = [5];
    state.currentRun.companions = ['foreman'];
    state.inventory.push('TOWN_PORTAL');
  });
  const confirmation = page.evaluate(async () => {
    const { confirmReturnWing } = await import('/src/ui/return_wing_confirmation.js');
    return confirmReturnWing();
  });
  await expect(page.locator('.confirm-dialog-message')).toContainText('翼が運ぶのはひとりだけ');
  await expect(page.locator('.confirm-dialog-message')).toContainText('至宝と');
  await page.keyboard.press('Escape');
  await confirmation.catch(() => null);
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    triggerRunResult('escape_scroll');
    return {
      cleared: [...state.unlockedMilestones],
      foreman: state.feats?.counters?.foremanRescued || 0,
      treasure: state.currentRun?.roundTrip?.treasure ?? state.runHistory[0]?.roundTrip?.treasure ?? null
    };
  });
  expect(after.cleared).toEqual([]);
  expect(after.foreman).toBe(0);
});
