import { test, expect } from './fixtures/browser-health.js';

test('Primary run path reaches Town again through UI actions @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });

  const screen = async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    return {
      gameState: state.gameState,
      menu: menuContext.type,
      returnReason: state.currentRun?.returnReason || null,
      visibleDocks: Array.from(document.querySelectorAll('#controls-panel .controls-group'))
        .filter(element => getComputedStyle(element).display !== 'none')
        .map(element => element.id),
      combatOverlay: getComputedStyle(document.querySelector('#combat-overlay')).display !== 'none',
    };
  });

  const expectSingleDock = async (dockId) => {
    await expect(page.locator(`#${dockId}`)).toBeVisible({ timeout: 10_000 });
    const state = await screen();
    expect(state.visibleDocks, `only ${dockId} should be visible`).toEqual([dockId]);
    expect(state.combatOverlay, `${dockId} should not leave the combat overlay behind`).toBe(false);
  };

  await expectSingleDock('town-controls');

  // Town -> Preparation -> Explore are crossed using the real departure controls.
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await page.locator('.solo-starting-kit-option').first().click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  const departButton = page.getByRole('button', { name: '迷宮へ向かう' });
  if (await departButton.isVisible()) await departButton.click();
  await expectSingleDock('explore-controls');
  expect(await screen()).toMatchObject({ gameState: 'explore' });

  // Make the next visible forward action produce a deterministic encounter.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const directions = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    ];
    const direction = directions.findIndex(({ dx, dy }, index) => {
      const cell = state.map?.[state.y]?.[state.x];
      const next = state.map?.[state.y + dy]?.[state.x + dx];
      return cell && next && next.type === 'empty' && !next.event && !next.trap &&
        !cell.walls[index] && !next.blockEnter[(index + 2) % 4];
    });
    if (direction < 0) throw new Error('No passable encounter direction at the run entry cell');
    state.dir = direction;
    // handleMove ticks exploration effects before checking the event, so two
    // steps leave one forced encounter after that tick.
    state.forcedEncounterSteps = 2;
    updateUI();
  });
  await page.locator('#btn-move-forward').click();
  await expect(page.locator('#combat-controls')).toBeVisible({ timeout: 10_000 });
  expect(await screen()).toMatchObject({ gameState: 'combat', menu: '' });

  // Keep the combat interaction real while making its result deterministic:
  // the escape action ends combat without depending on enemy traits or rolls.
  await page.locator('#btn-combat-run').click();
  await expect(page.locator('#explore-controls')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expectSingleDock('explore-controls');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.inventory.push('HEAL_POTION');
    updateUI();
  });

  // Explore -> Bag is also crossed through its visible action.
  await page.locator('#btn-inspect').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await expect(page.locator('#submenu-options')).toContainText('傷薬');
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'item_inventory' });
  await page.locator('#btn-submenu-back').click();
  await expectSingleDock('explore-controls');

  // Prepare a reachable B5F portal target; the portal and every subsequent gate
  // are still opened and confirmed through the rendered UI.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const map = structuredClone(state.maps[0]);
    const directions = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    ];
    let source = null;
    for (let y = 1; y < map.length - 1 && !source; y++) {
      for (let x = 1; x < map[y].length - 1 && !source; x++) {
        for (let dir = 0; dir < directions.length; dir++) {
          const { dx, dy } = directions[dir];
          const cell = map[y][x];
          const target = map[y + dy]?.[x + dx];
          if (cell.type === 'empty' && target?.type === 'empty' &&
              !cell.walls[dir] && !target.blockEnter[(dir + 2) % 4]) {
            source = { x, y, dir, targetX: x + dx, targetY: y + dy };
            break;
          }
        }
      }
    }
    if (!source) throw new Error('No passable portal direction in the generated map');
    map[source.targetY][source.targetX] = {
      ...map[source.targetY][source.targetX],
      event: 'return_portal',
      milestoneFloor: 5,
      trap: null,
    };
    map[source.y][source.x] = { ...map[source.y][source.x], event: null, trap: null };
    state.maps[4] = map;
    state.visitedMaps[4] = map.map(row => row.map(() => false));
    state.floor = 5;
    state.x = source.x;
    state.y = source.y;
    state.dir = source.dir;
    state.currentRun.floorsVisited = [1, 5];
    state.currentRun.deepestFloor = 5;
    state.currentRun.defeatedMilestones = [5];
    state.currentRun.unbankedObjectLoot ||= [];
    updateUI();
  });
  await page.locator('#btn-move-forward').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await expect(page.locator('.milestone-portal-choice-card[data-portal-decision="return"] button')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'milestone_portal' });
  expect((await screen()).visibleDocks).toEqual(['submenu-controls']);

  // Portal Return -> Result -> Town -> Preparation remains one UI-operated chain.
  await page.locator('.milestone-portal-choice-card[data-portal-decision="return"] > button').click();
  await expect(page.locator('.milestone-portal-confirmation')).toBeVisible();
  await page.locator('#btn-portal-confirm').click();
  await expect(page.locator('#result-overlay')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'result', returnReason: 'milestone_portal' });
  await page.locator('#btn-result-castle').click();
  await expectSingleDock('town-controls');
  expect(await screen()).toMatchObject({ gameState: 'town' });
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'solo_start' });
});
