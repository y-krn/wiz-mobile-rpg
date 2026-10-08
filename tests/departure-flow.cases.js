import { test, expect } from './fixtures/browser-health.js';
import { exploreMove, satchelAction } from './explore-input-helpers.js';
import { waitForPixiReady } from './ui-ux-helpers.js';

test('New runs always use the unified rules without a mode selector @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?tryout=vnext');
  await waitForPixiReady(page);
  await page.locator('#btn-town-dungeon').click();
  await page.locator('.solo-starting-kit-option').first().click();
  await page.locator('#btn-kit-confirm').click();
  await expect(page.locator('[data-trial-profile]')).toHaveCount(0);
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  await expect(page.locator('#trial-mode-badge')).toHaveCount(0);

  const run = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { runSeed: state.currentRun.runSeed, url: location.search };
  });
  expect(run.url).toContain('tryout=vnext');
  await expect.poll(() => page.evaluate(() => JSON.parse(
    localStorage.getItem('mobile_wiz_rpg_autosave') || 'null'
  )?.currentRun?.runSeed ?? null)).toBe(run.runSeed);
  expect(await page.evaluate(() => localStorage.getItem('mobile_wiz_rpg_vnext_trial_autosave'))).toBeNull();
});

// A run starts on the first floor of a dungeon (#2060): 1 is the mine, 6 the
// catacomb. Either way the adventurer is fresh.
test('Unified runs start and restore in the mine and the catacomb @smoke', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const expectedHp = { 1: 45, 6: 45 };

  for (const startFloor of [1, 6]) {
    await page.goto('/');
    await waitForPixiReady(page);
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.currentRun = null;
      state.party = [];
      state.gameState = 'town';
      state.floor = 1;
      state.unlockedMilestones = [5];
      updateUI();
    });

    await expect(page.locator('#btn-town-dungeon')).toBeVisible();
    await page.locator('#btn-town-dungeon').click();
    if (startFloor === 1) {
      // First departure: no previous preparation, so the kit is chosen first.
      await page.locator('.solo-starting-kit-option').first().click();
      await page.locator('#btn-kit-confirm').click();
    } else {
      // Later departures open pre-filled with the previous preparation.
      await expect(page.locator('.solo-preparation-summary')).toContainText('鋼の前線キット');
    }
    await page.locator(`[data-start-floor="${startFloor}"]`).click();
    await page.locator('#btn-departure-start').click();
    await expect(page.locator('#explore-controls')).toBeVisible();

    const started = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return {
        startFloor: state.currentRun.startFloor,
        baseline: state.currentRun.phase4cV1Baseline,
        hp: state.party[0].hp,
        maxHp: state.party[0].maxHp,
      };
    });
    expect(started.startFloor).toBe(startFloor);
    expect(started.maxHp).toBe(expectedHp[startFloor]);
    expect(started.hp).toBe(expectedHp[startFloor]);
    expect(started.baseline).toBe(0);

    await expect.poll(() => page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave') || 'null');
      return saved?.currentRun?.startFloor ?? null;
    })).toBe(startFloor);
    await page.reload();
    await waitForPixiReady(page);
    const restored = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return {
        gameState: state.gameState,
        startFloor: state.currentRun?.startFloor,
        baseline: state.currentRun?.phase4cV1Baseline,
        maxHp: state.party[0]?.maxHp,
      };
    });
    expect(restored.gameState).toBe('explore');
    expect(restored.startFloor).toBe(startFloor);
    expect(restored.maxHp).toBe(expectedHp[startFloor]);
    expect(restored.baseline).toBe(0);
  }
});

test('Primary run path reaches Town again through UI actions @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await waitForPixiReady(page);
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
  await page.locator('#btn-kit-confirm').click();
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
  await exploreMove(page, 'forward');
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

  // Explore -> Bag is also crossed through the satchel on the adventurer's card.
  await (await satchelAction(page, '#btn-inspect')).click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await expect(page.locator('#submenu-options')).toContainText('傷薬');
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'item_inventory' });
  await page.locator('#btn-submenu-back').click();
  await expectSingleDock('explore-controls');

  // Walk out (#2062): stand next to the first floor's up stairs, step onto
  // them, and leave through the rendered menu. There is no Portal.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const map = state.map;
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
          if (cell.type === 'empty' && !cell.event && target?.type === 'stairs-up' &&
              !cell.walls[dir] && !target.blockEnter?.[(dir + 2) % 4]) {
            source = { x, y, dir };
            break;
          }
        }
      }
    }
    if (!source) throw new Error('No cell next to the up stairs in the generated map');
    map[source.y][source.x] = { ...map[source.y][source.x], trap: null };
    state.x = source.x;
    state.y = source.y;
    state.dir = source.dir;
    state.repelTurns = 999;
    state.currentRun.unbankedObjectLoot ||= [];
    updateUI();
  });
  await exploreMove(page, 'forward');
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await expect(page.locator('[data-stairs-up="surface"]')).toBeVisible();
  await expect.poll(async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { isControlsGuarded } = await import('/src/controls_guard.js');
    return !state.transitioning && !isControlsGuarded();
  })).toBe(true);
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'stairs_up' });
  expect((await screen()).visibleDocks).toEqual(['submenu-controls']);

  // Walk out -> Result -> Town -> Preparation remains one UI-operated chain.
  await page.locator('[data-stairs-up="surface"]').click();
  await expect(page.locator('#result-overlay')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'result', returnReason: 'surface' });
  await page.locator('#btn-result-castle').click();
  await expectSingleDock('town-controls');
  expect(await screen()).toMatchObject({ gameState: 'town' });
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'solo_start' });
});
