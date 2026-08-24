import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS, startSoloRun, beginPendingOutcomePlayback } from './ui-ux-helpers.js';
test('Three-column corridor renderer draws adjacent front walls', async ({ page }) => {
  await page.goto('/');
  const cyanPixels = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer, getProjectionColumn, getProjectionPlanes } = await import('/src/renderer.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const makeCell = () => ({ walls: [false, false, false, false], type: 'empty' });

    state.gameState = 'explore';
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.maps[0] = Array.from({ length: 24 }, () => Array.from({ length: 24 }, makeCell));
    state.map[5][4].walls[0] = true;
    state.map[5][6].walls[0] = true;
    dungeonRenderer.draw();

    const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
    const countCyan = (centerX) => {
      const pixels = ctx.getImageData(centerX - 6, 55, 13, 150).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 1] > 180 && pixels[i + 2] > 180) count++;
      }
      return count;
    };

    const projection = getProjectionPlanes(getFloorTheme(state.floor).visualSignature.geometry);
    return [
      countCyan(Math.round((getProjectionColumn(projection, 1, -1).rightTop + getProjectionColumn(projection, 1, -1).rightBottom) / 2)),
      countCyan(Math.round((getProjectionColumn(projection, 1, 1).leftTop + getProjectionColumn(projection, 1, 1).leftBottom) / 2)),
    ];
  });

  expect(cyanPixels[0]).toBeGreaterThan(80);
  expect(cyanPixels[1]).toBeGreaterThan(80);
});

test('Combat monsters render colored neon bodies with visible white cores at four-enemy scale', async ({ page }) => {
  await page.goto('/');

  const pixelCounts = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const ctx = canvas.getContext('2d');
    const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;

    state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
    state.floor = 1;
    state.gameState = 'combat';
    state.combatState = {
      phase: 'choose_actions',
      monsters: Array.from({ length: 4 }, (_, index) => ({
        name: `ネオン検証${index + 1}`,
        level: 1,
        hp: 10,
        maxHp: 10,
        color: '#00e5ff',
        spriteType: 'biter',
      })),
    };
    dungeonRenderer.draw3DCorridors = () => {};
    dungeonRenderer.draw();
    dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;

    const countPixels = ({ x, y, width, height }) => {
      const pixels = ctx.getImageData(x, y, width, height).data;
      let color = 0;
      let white = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];
        const alpha = pixels[i + 3];
        if (alpha > 0 && red < 80 && green > 160 && blue > 190) color++;
        if (alpha > 0 && red > 180 && green > 220 && blue > 220) white++;
      }
      return { color, white };
    };

    return [
      { x: 65, y: 60, width: 70, height: 65 },
      { x: 265, y: 60, width: 70, height: 65 },
      { x: 65, y: 170, width: 70, height: 65 },
      { x: 265, y: 170, width: 70, height: 65 },
    ].map(countPixels);
  });

  expect(pixelCounts).toHaveLength(4);
  for (const counts of pixelCounts) {
    expect(counts.color).toBeGreaterThan(20);
    expect(counts.white).toBeGreaterThan(5);
  }
});

test('Five-column corridor renderer draws outer front walls', async ({ page }) => {
  await page.goto('/');
  const cyanPixels = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer, getProjectionColumn, getProjectionPlanes } = await import('/src/renderer.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const makeCell = () => ({ walls: [false, false, false, false], type: 'empty' });

    state.gameState = 'explore';
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.maps[0] = Array.from({ length: 24 }, () => Array.from({ length: 24 }, makeCell));
    state.map[3][3].walls[0] = true;
    state.map[3][7].walls[0] = true;
    dungeonRenderer.draw();

    const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
    const countCyan = (centerX) => {
      const pixels = ctx.getImageData(centerX - 6, 100, 13, 60).data;
      let count = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 1] > 180 && pixels[i + 2] > 180) count++;
      }
      return count;
    };

    const projection = getProjectionPlanes(getFloorTheme(state.floor).visualSignature.geometry);
    const visible = [
      countCyan(Math.round((getProjectionColumn(projection, 3, -2).leftTop + getProjectionColumn(projection, 3, -2).leftBottom) / 2)),
      countCyan(Math.round((getProjectionColumn(projection, 3, 2).rightTop + getProjectionColumn(projection, 3, 2).rightBottom) / 2)),
    ];

    state.map[5][5].walls[1] = true;
    state.map[5][5].walls[3] = true;
    dungeonRenderer.draw();

    return {
      visible,
      occluded: [
        countCyan(Math.round((getProjectionColumn(projection, 3, -2).leftTop + getProjectionColumn(projection, 3, -2).leftBottom) / 2)),
        countCyan(Math.round((getProjectionColumn(projection, 3, 2).rightTop + getProjectionColumn(projection, 3, 2).rightBottom) / 2)),
      ],
    };
  });

  expect(cyanPixels.visible[0]).toBeGreaterThan(15);
  expect(cyanPixels.visible[1]).toBeGreaterThan(15);
  expect(cyanPixels.occluded[0]).toBeLessThan(10);
  expect(cyanPixels.occluded[1]).toBeLessThan(10);
});

test('3D corridor draws unopened chest icons at perspective-scaled depths', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { EVENT_TYPES } = await import('/src/data.js');
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const makeCell = () => ({
      walls: [false, false, false, false],
      type: 'empty',
      event: null,
    });

    state.gameState = 'chest';
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.maps[0] = Array.from({ length: 24 }, () => Array.from({ length: 24 }, makeCell));
    state.map[4][5].event = EVENT_TYPES.CHEST;
    state.map[3][5].event = EVENT_TYPES.CHEST;
    state.map[2][5].event = EVENT_TYPES.CHEST;
    state.map[5][5].event = EVENT_TYPES.CHEST;
    state.map[4][6].event = EVENT_TYPES.CHEST;

    const originalDrawChestIcon = dungeonRenderer.drawChestIcon;
    const depths = [];
    dungeonRenderer.drawChestIcon = (ctx, z) => {
      depths.push(z);
      originalDrawChestIcon.call(dungeonRenderer, ctx, z);
    };
    dungeonRenderer.draw3DCorridors(dungeonRenderer.ctx);

    const boundsAtDepth = (z) => {
      const points = [];
      const captureCtx = new Proxy({}, {
        set(target, property, value) {
          target[property] = value;
          return true;
        },
        get(target, property) {
          if (property === 'moveTo' || property === 'lineTo') {
            return (x, y) => points.push({ x, y });
          }
          if (property === 'fillRect' || property === 'strokeRect') {
            return (x, y, width, height) => {
              points.push({ x, y }, { x: x + width, y: y + height });
            };
          }
          return () => {};
        },
      });
      originalDrawChestIcon.call(dungeonRenderer, captureCtx, z);
      return {
        width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
        height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)),
      };
    };

    const initialDepths = [...depths];
    state.map[4][5].event = null;
    state.map[3][5].event = null;
    state.map[2][5].event = null;
    depths.length = 0;
    dungeonRenderer.draw3DCorridors(dungeonRenderer.ctx);
    dungeonRenderer.drawChestIcon = originalDrawChestIcon;

    return {
      initialDepths,
      afterOpenedDepths: depths,
      near: boundsAtDepth(1),
      far: boundsAtDepth(3),
    };
  });

  expect(result.initialDepths).toEqual([3, 2, 1]);
  expect(result.afterOpenedDepths).toEqual([]);
  expect(result.near.width).toBeGreaterThan(result.far.width);
  expect(result.near.height).toBeGreaterThan(result.far.height);
});

test('Mini-map hides stairs-up markers and glows on every floor', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
    const makeGrid = type => Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) => ({
        walls: [false, false, false, false],
        blockEnter: [false, false, false, false],
        type: x === 4 && y === 3 ? type : 'empty',
        event: null,
      }))
    );

    const originalIcon = dungeonRenderer.drawStairMiniMapIcon;
    const originalArc = ctx.arc;
    const icons = [];
    const glowArcs = [];
    dungeonRenderer.drawStairMiniMapIcon = (...args) => {
      icons.push(args[4]);
      return originalIcon.call(dungeonRenderer, ...args);
    };
    ctx.arc = (x, y, radius, ...args) => {
      if (radius === 9) glowArcs.push(radius);
      return originalArc.call(ctx, x, y, radius, ...args);
    };

    state.x = 3;
    state.y = 3;
    state.dir = 0;
    state.dumapicTurns = 0;
    state.lightTurns = 0;
    state.lightPower = '';
    state.roamingMonsters = [];
    state.dungeonMemory = { mapFragments: {} };

    const upstairs = [];
    for (const floor of [1, 2]) {
      state.floor = floor;
      state.maps[floor - 1] = makeGrid('stairs-up');
      state.visitedMaps[floor - 1] = Array.from({ length: 7 }, () => Array(7).fill(true));
      const iconStart = icons.length;
      const glowStart = glowArcs.length;
      dungeonRenderer.drawMiniMap(ctx);
      upstairs.push({
        floor,
        icons: icons.length - iconStart,
        glows: glowArcs.length - glowStart,
      });
    }

    state.maps[1] = makeGrid('stairs-down');
    const iconStart = icons.length;
    const glowStart = glowArcs.length;
    dungeonRenderer.drawMiniMap(ctx);
    const downstairs = {
      icons: icons.slice(iconStart),
      glows: glowArcs.length - glowStart,
    };

    dungeonRenderer.drawStairMiniMapIcon = originalIcon;
    ctx.arc = originalArc;
    return { upstairs, downstairs };
  });

  expect(result.upstairs).toEqual([
    { floor: 1, icons: 0, glows: 0 },
    { floor: 2, icons: 0, glows: 0 },
  ]);
  expect(result.downstairs.icons).toEqual([false]);
  expect(result.downstairs.glows).toBe(1);
});

test('Chest opened immediately after entering the dungeon does not draw the town background', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { closeSubmenu, menuContext } = await import('/src/navigation.js');
    const { enterDungeon, executeEnterDungeon } = await import('/src/movement.js');
    const { openChestMenu } = await import('/src/chest.js');
    const { dungeonRenderer } = await import('/src/renderer.js');

    state.party = [createSoloCharacter('Fighter')];
    state.gameState = 'town';
    enterDungeon();
    const prevGameStateAfterSoloStart = menuContext.prevGameState;

    executeEnterDungeon(1);
    const prevGameStateAfterEntry = menuContext.prevGameState;
    state.chestState = {
      trap: 'none',
      item: 'HEAL_POTION',
      inspected: false,
      identifiedTrap: '',
      x: state.x,
      y: state.y,
      lootHint: { label: '静かな気配', aura: 'weak' },
    };
    openChestMenu();

    let townBackgroundDraws = 0;
    let chestDraws = 0;
    const originalDrawTownBackground = dungeonRenderer.drawTownBackground;
    const originalDrawChest = dungeonRenderer.drawChest;
    const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;
    dungeonRenderer.drawTownBackground = () => { townBackgroundDraws++; };
    dungeonRenderer.drawChest = () => { chestDraws++; };
    dungeonRenderer.draw3DCorridors = () => {};

    dungeonRenderer.draw();

    dungeonRenderer.drawTownBackground = originalDrawTownBackground;
    dungeonRenderer.drawChest = originalDrawChest;
    dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;

    const prevGameStateInChest = menuContext.prevGameState;
    closeSubmenu();

    return {
      prevGameStateAfterSoloStart,
      prevGameStateAfterEntry,
      prevGameStateInChest,
      townBackgroundDraws,
      chestDraws,
      gameStateAfterClose: state.gameState,
    };
  });

  expect(result.prevGameStateAfterSoloStart).toBe('town');
  expect(result.prevGameStateAfterEntry).toBeNull();
  expect(result.prevGameStateInChest).toBeNull();
  expect(result.townBackgroundDraws).toBe(0);
  expect(result.chestDraws).toBe(1);
  expect(result.gameStateAfterClose).toBe('explore');
});

test('Renderer and navigation keep modal transitions safe with stale context', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { createSoloCharacter, state } = await import('/src/state.js');
    const { goBackSubmenu, menuContext, menuHistory, openSubmenu } = await import('/src/navigation.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { updateUI } = await import('/src/ui.js');

    state.party = [createSoloCharacter('Fighter')];
    state.maps[0] = [[{ walls: [true, true, true, true], type: 'empty' }]];
    state.visitedMaps[0] = [[true]];
    state.floor = 1;
    state.gameState = 'combat';
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: 'Biter', level: 1, hp: 10, maxHp: 10 }],
    };
    menuContext.type = '';
    menuContext.targetType = 'enemy';
    menuContext.prevGameState = null;
    menuHistory.length = 0;

    openSubmenu('combat_target', '攻撃対象を選択');
    const modalOpen = document.getElementById('combat-overlay').style.display === 'flex';
    goBackSubmenu();
    const restoredCombat = state.gameState === 'combat' && document.getElementById('combat-overlay').style.display === 'none';

    state.gameState = 'submenu';
    state.combatState = {
      phase: 'choose_actions',
      monsters: [{ name: 'Biter', level: 1, hp: 10, maxHp: 10 }],
    };
    menuContext.type = 'combat_target';
    menuContext.prevGameState = 'town';
    menuHistory.length = 0;
    updateUI();
    const staleModalHidden = document.getElementById('combat-overlay').style.display === 'none';
    goBackSubmenu();
    const restoredTownFromStaleCombat = state.gameState === 'town' && document.getElementById('combat-overlay').style.display === 'none';

    state.gameState = 'submenu';
    state.combatState = null;
    state.chestState = null;
    menuContext.type = undefined;
    menuContext.prevGameState = { stale: true };
    menuHistory.length = 0;
    updateUI();
    const staleVisibility = dungeonRenderer.getSceneVisibility();
    goBackSubmenu();

    return {
      modalOpen,
      restoredCombat,
      staleModalHidden,
      restoredTownFromStaleCombat,
      staleVisibility,
      restoredExplore: state.gameState === 'explore',
    };
  });

  expect(result.modalOpen).toBe(true);
  expect(result.restoredCombat).toBe(true);
  expect(result.staleModalHidden).toBe(true);
  expect(result.restoredTownFromStaleCombat).toBe(true);
  expect(result.staleVisibility.showCombat).toBe(false);
  expect(result.staleVisibility.showChest).toBe(false);
  expect(result.restoredExplore).toBe(true);
});

for (const vp of VIEWPORTS) {
  test(`Combat submenu falls back safely after combat data is lost at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { closeSubmenu, goBackSubmenu, menuContext, menuHistory, openSubmenu } = await import('/src/navigation.js');

      const validCombatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', level: 1, hp: 10, maxHp: 10 }],
      };
      const resetCombatSubmenu = (map) => {
        state.maps[0] = map;
        state.floor = 1;
        state.x = 0;
        state.y = 0;
        state.gameState = 'combat';
        state.combatState = structuredClone(validCombatState);
        menuContext.type = '';
        menuContext.prevGameState = null;
        menuHistory.length = 0;
        openSubmenu('combat_target', '攻撃対象を選択');
      };

      resetCombatSubmenu([[{ walls: [true, true, true, true], type: 'empty' }]]);
      state.combatState = null;
      goBackSubmenu();
      const missingWithMap = state.gameState;

      resetCombatSubmenu([]);
      state.combatState = { phase: 'choose_actions', monsters: [null] };
      closeSubmenu();
      const malformedWithoutMap = state.gameState;

      return { missingWithMap, malformedWithoutMap };
    });

    expect(result).toEqual({
      missingWithMap: 'explore',
      malformedWithoutMap: 'town',
    });
  });
}

for (const vp of VIEWPORTS) {
  test(`Nested combat history and stale spell context stay hidden at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { goBackSubmenu, menuContext, menuHistory, openSubmenu } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      const { renderSpellOverlay } = await import('/src/spell_menu.js');

      const validCombatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', level: 1, hp: 10, maxHp: 10 }],
      };
      const resetContext = (map) => {
        state.party = [createSoloCharacter('Priest')];
        state.party[0].spells = [];
        state.maps[0] = map;
        state.floor = 1;
        state.x = 0;
        state.y = 0;
        state.gameState = 'combat';
        state.combatState = structuredClone(validCombatState);
        menuContext.type = '';
        menuContext.actorIdx = 0;
        menuContext.prevGameState = null;
        menuHistory.length = 0;
      };

      resetContext([[{ walls: [true, true, true, true], type: 'empty' }]]);
      openSubmenu('combat_spell', '呪文を唱える');
      openSubmenu('combat_target', '攻撃対象を選択');
      goBackSubmenu();
      const validNestedCombat = {
        gameState: state.gameState,
        menuType: menuContext.type,
        historyLength: menuHistory.length,
      };

      resetContext([[{ walls: [true, true, true, true], type: 'empty' }]]);
      openSubmenu('combat_spell', '呪文を唱える');
      openSubmenu('combat_target', '攻撃対象を選択');
      state.combatState = { phase: 'choose_actions', monsters: [null] };
      goBackSubmenu();
      const malformedNestedCombat = state.gameState;

      resetContext([]);
      openSubmenu('combat_spell', '呪文を唱える');
      openSubmenu('combat_target', '攻撃対象を選択');
      state.combatState = { phase: 'choose_actions', monsters: [null] };
      goBackSubmenu();
      const malformedNestedCombatWithoutMap = state.gameState;

      const staleSpellCases = [
        { gameState: 'town', prevGameState: null, type: 'spell_select' },
        { gameState: 'explore', prevGameState: null, type: 'spell_target_ally' },
        { gameState: 'submenu', prevGameState: 'town', type: 'spell_select' },
      ].map(({ gameState, prevGameState, type }) => {
        state.gameState = gameState;
        state.combatState = null;
        menuContext.type = type;
        menuContext.prevGameState = prevGameState;
        updateUI();
        renderSpellOverlay();
        const overlay = document.getElementById('spell-overlay');
        return {
          gameState,
          overlayDisplay: overlay.style.display,
          overlayChildren: overlay.children.length,
        };
      });

      return { validNestedCombat, malformedNestedCombat, malformedNestedCombatWithoutMap, staleSpellCases };
    });

    expect(result.validNestedCombat).toEqual({
      gameState: 'submenu',
      menuType: 'combat_spell',
      historyLength: 0,
    });
    expect(result.malformedNestedCombat).toBe('explore');
    expect(result.malformedNestedCombatWithoutMap).toBe('town');
    for (const staleSpell of result.staleSpellCases) {
      expect(staleSpell).toMatchObject({
        overlayDisplay: 'none',
        overlayChildren: 0,
      });
    }
  });
}

for (const vp of VIEWPORTS) {
  test(`Malformed map and modal context fail closed at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { getScreenViewState } = await import('/src/state/view_state.js');
      const { getFloorExplorationRate, updateUI } = await import('/src/ui.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      const { renderSpellOverlay, spellMenuState } = await import('/src/spell_menu.js');
      const { combatSelection } = await import('/src/combat.js');

      const cell = () => ({ walls: [false, false, false, false], type: 'empty' });
      const overlaySnapshot = overlay => ({
        display: overlay?.style.display ?? 'missing',
        children: overlay?.children.length ?? -1,
      });
      const validCombatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', level: 1, hp: 10, maxHp: 10 }],
      };
      state.party = [createSoloCharacter('Priest')];
      state.party[0].spells = ['DIOS'];
      state.floor = 1;
      state.x = 1;
      state.y = 1;
      state.visitedMaps[0] = [[true, true, true], null, [true, true, true]];
      const malformedRows = [
        [cell(), cell(), cell()],
        null,
        [cell(), cell(), cell()],
      ];
      state.maps[0] = malformedRows;
      state.gameState = 'explore';
      state.combatState = null;
      menuContext.type = '';
      menuContext.prevGameState = null;

      let malformedMapError = null;
      let sparseMapError = null;
      try {
        updateUI();
        getFloorExplorationRate();
      } catch (error) {
        malformedMapError = error.message;
      }
      const malformedMapView = getScreenViewState(state, menuContext);

      const sparseRow = [cell(), cell(), cell()];
      delete sparseRow[1];
      state.maps[0] = [[cell(), cell(), cell()], sparseRow, [cell(), cell(), cell()]];
      try {
        updateUI();
        getFloorExplorationRate();
      } catch (error) {
        sparseMapError = error.message;
      }
      const sparseMapView = getScreenViewState(state, menuContext);

      state.maps[0] = [[cell(), cell(), cell()], [cell(), cell(), cell()], [cell(), cell(), cell()]];
      state.visitedMaps[0] = [[true, true, true], [true, true, true], [true, true, true]];
      state.combatState = structuredClone(validCombatState);
      state.gameState = 'submenu';
      menuContext.prevGameState = 'combat';
      menuContext.type = 'combat_spell';
      menuContext.actorIdx = 99;
      let invalidCasterError = null;
      try {
        updateUI();
        renderCombatOverlay();
      } catch (error) {
        invalidCasterError = error.message;
      }
      const invalidCasterOverlay = overlaySnapshot(document.getElementById('combat-overlay'));

      state.party[0].status = 'dead';
      menuContext.actorIdx = 0;
      let deadCasterError = null;
      try {
        updateUI();
        renderCombatOverlay();
      } catch (error) {
        deadCasterError = error.message;
      }
      const deadCasterOverlay = overlaySnapshot(document.getElementById('combat-overlay'));

      state.party[0].status = 'ok';
      state.party[0].spells = ['HALITO'];
      state.gameState = 'submenu';
      menuContext.prevGameState = 'explore';
      menuContext.type = 'spell_target_ally';
      menuContext.actorIdx = 0;
      menuContext.spellName = 'HALITO';
      let incompatibleSpellTargetError = null;
      try {
        updateUI();
        renderSpellOverlay();
      } catch (error) {
        incompatibleSpellTargetError = error.message;
      }
      const incompatibleSpellTargetOverlay = overlaySnapshot(document.getElementById('spell-overlay'));

      state.party[0].spells = ['DIOS'];
      let unownedSpellError = null;
      try {
        updateUI();
        renderSpellOverlay();
      } catch (error) {
        unownedSpellError = error.message;
      }
      const unownedSpellOverlay = overlaySnapshot(document.getElementById('spell-overlay'));

      menuContext.type = 'combat_target';
      menuContext.targetType = 'unknown';
      menuContext.spellName = 'UNKNOWN';
      let invalidCombatTargetError = null;
      try {
        updateUI();
        renderCombatOverlay();
      } catch (error) {
        invalidCombatTargetError = error.message;
      }
      const invalidCombatTargetOverlay = overlaySnapshot(document.getElementById('combat-overlay'));

      state.gameState = 'submenu';
      menuContext.prevGameState = 'explore';
      menuContext.type = 'spell_target_ally';
      menuContext.actorIdx = 0;
      menuContext.spellName = 'UNKNOWN';
      let invalidSpellTargetError = null;
      try {
        updateUI();
        renderSpellOverlay();
      } catch (error) {
        invalidSpellTargetError = error.message;
      }
      const invalidSpellOverlayElement = document.getElementById('spell-overlay');
      const invalidSpellOverlay = {
        display: invalidSpellOverlayElement.style.display,
        children: invalidSpellOverlayElement.children.length,
      };

      state.party[0].spells = ['UNKNOWN'];
      state.gameState = 'submenu';
      menuContext.prevGameState = 'explore';
      menuContext.type = 'spell_select';
      menuContext.actorIdx = 0;
      spellMenuState.selectedKey = 'UNKNOWN';
      let invalidSpellSelectionError = null;
      try {
        updateUI();
        renderSpellOverlay();
      } catch (error) {
        invalidSpellSelectionError = error.message;
      }
      const invalidSpellSelectionOverlayElement = document.getElementById('spell-overlay');
      const invalidSpellSelectionOverlay = {
        ...overlaySnapshot(invalidSpellSelectionOverlayElement),
        emptyList: Boolean(invalidSpellSelectionOverlayElement.querySelector('.list-empty')),
      };

      state.gameState = 'explore';
      menuContext.type = '';
      menuContext.prevGameState = null;
      combatSelection.actions = [];
      document.getElementById('btn-combat-fight').click();

      return {
        malformedMapError,
        malformedMapView: { hasMap: malformedMapView.hasMap, hasCurrentCell: malformedMapView.hasCurrentCell },
        sparseMapError,
        sparseMapView: { hasMap: sparseMapView.hasMap, hasCurrentCell: sparseMapView.hasCurrentCell },
        invalidCasterError,
        invalidCasterOverlay,
        deadCasterError,
        deadCasterOverlay,
        incompatibleSpellTargetError,
        incompatibleSpellTargetOverlay,
        unownedSpellError,
        unownedSpellOverlay,
        invalidCombatTargetError,
        invalidCombatTargetOverlay,
        invalidSpellTargetError,
        invalidSpellOverlay,
        invalidSpellSelectionError,
        invalidSpellSelection: {
          selectedKey: spellMenuState.selectedKey,
          ...invalidSpellSelectionOverlay,
        },
        staleCombatActionCount: combatSelection.actions.length,
        staleCombatGameState: state.gameState,
      };
    });

    expect(result).toMatchObject({
      malformedMapError: null,
      malformedMapView: { hasMap: false, hasCurrentCell: false },
      sparseMapError: null,
      sparseMapView: { hasMap: false, hasCurrentCell: false },
      invalidCasterError: null,
      invalidCasterOverlay: { display: 'none', children: 0 },
      deadCasterError: null,
      deadCasterOverlay: { display: 'none', children: 0 },
      incompatibleSpellTargetError: null,
      incompatibleSpellTargetOverlay: { display: 'none', children: 0 },
      unownedSpellError: null,
      unownedSpellOverlay: { display: 'none', children: 0 },
      invalidCombatTargetError: null,
      invalidCombatTargetOverlay: { display: 'none', children: 0 },
      invalidSpellTargetError: null,
      invalidSpellOverlay: { display: 'none', children: 0 },
      invalidSpellSelectionError: null,
      invalidSpellSelection: { selectedKey: null, display: 'flex', emptyList: true },
      staleCombatActionCount: 0,
      staleCombatGameState: 'explore',
    });
  });
}

for (const vp of VIEWPORTS) {
  test(`Direct combat handlers ignore stale combat data at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { cancelCombatAction, advanceActionSelection, resolveCombatRound, selectCombatAction, toggleCombatAuto } = await import('/src/combat.js');
      const { combatSelection } = await import('/src/combat.js');

      const cell = { walls: [false, false, false, false], type: 'empty' };
      state.party = [createSoloCharacter('Fighter')];
      state.maps[0] = [[cell]];
      state.floor = 1;
      state.x = 0;
      state.y = 0;
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }],
      };
      state.gameState = 'explore';
      state.transitioning = false;
      menuContext.type = '';
      menuContext.prevGameState = null;
      combatSelection.charIdx = 0;
      combatSelection.actions = [];
      const errors = [];
      for (const action of [
        () => toggleCombatAuto(),
        () => advanceActionSelection(),
        () => selectCombatAction('fight'),
        () => cancelCombatAction(),
        () => resolveCombatRound(),
      ]) {
        try {
          action();
        } catch (error) {
          errors.push(error.message);
        }
      }
      state.gameState = 'combat';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }],
      };
      state.party = [null];
      state.transitioning = false;
      combatSelection.charIdx = 0;
      combatSelection.actions = [];
      const invalidActorErrors = [];
      for (const action of [
        () => toggleCombatAuto(),
        () => advanceActionSelection(),
        () => selectCombatAction('fight'),
        () => cancelCombatAction(),
        () => resolveCombatRound(),
      ]) {
        try {
          action();
        } catch (error) {
          invalidActorErrors.push(error.message);
        }
      }
      const invalidActor = {
        errors: invalidActorErrors,
        phase: state.combatState.phase,
        actionCount: combatSelection.actions.length,
      };

      state.party = [createSoloCharacter('Fighter')];
      state.combatState.phase = 'resolving';
      combatSelection.charIdx = 0;
      combatSelection.actions = [];
      const invalidPhaseErrors = [];
      for (const action of [
        () => selectCombatAction('fight'),
        () => advanceActionSelection(),
        () => cancelCombatAction(),
        () => resolveCombatRound(),
      ]) {
        try {
          action();
        } catch (error) {
          invalidPhaseErrors.push(error.message);
        }
      }
      const invalidPhase = {
        errors: invalidPhaseErrors,
        phase: state.combatState.phase,
        actionCount: combatSelection.actions.length,
      };

      state.combatState.phase = 'choose_actions';
      state.transitioning = true;
      const transitioningErrors = [];
      for (const action of [
        () => selectCombatAction('fight'),
        () => advanceActionSelection(),
        () => cancelCombatAction(),
        () => resolveCombatRound(),
      ]) {
        try {
          action();
        } catch (error) {
          transitioningErrors.push(error.message);
        }
      }
      const transitioning = {
        errors: transitioningErrors,
        phase: state.combatState.phase,
        actionCount: combatSelection.actions.length,
      };
      state.gameState = 'explore';
      return {
        errors,
        gameState: state.gameState,
        combatPhase: state.combatState.phase,
        actionCount: combatSelection.actions.length,
        invalidActor,
        invalidPhase,
        transitioning,
      };
    });

    expect(result).toEqual({
      errors: [],
      gameState: 'explore',
      combatPhase: 'choose_actions',
      actionCount: 0,
      invalidActor: { errors: [], phase: 'choose_actions', actionCount: 0 },
      invalidPhase: { errors: [], phase: 'resolving', actionCount: 0 },
      transitioning: { errors: [], phase: 'choose_actions', actionCount: 0 },
    });
  });
}

for (const vp of VIEWPORTS) {
  test(`Startup combat resume fails closed for unusable party at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const basePayload = await page.evaluate(async () => {
      const { createSavePayload, createSoloCharacter, state } = await import('/src/state.js');
      state.party = [createSoloCharacter('Fighter')];
      state.gameState = 'combat';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }],
      };
      return createSavePayload();
    });

    const results = [];
    for (const partyShape of ['null', 'sparse', 'all-dead']) {
      await page.evaluate(async ({ payload, partyShape }) => {
        const { state } = await import('/src/state.js');
        state.transitioning = true;
        const data = structuredClone(payload);
        data.gameState = 'combat';
        data.combatState = {
          phase: 'choose_actions',
          monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }],
        };
        if (partyShape === 'null') data.party = null;
        if (partyShape === 'sparse') data.party = [null];
        if (partyShape === 'all-dead') data.party = [{ ...data.party[0], status: 'dead' }];
        localStorage.setItem('mobile_wiz_rpg_autosave', JSON.stringify(data));
      }, { payload: basePayload, partyShape });
      await page.reload();
      await page.waitForLoadState('networkidle');

      results.push(await page.evaluate(async () => {
        const { state } = await import('/src/state.js');
        const { getScreenViewState } = await import('/src/state/view_state.js');
        const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
        const view = getScreenViewState(state, null);
        return {
          gameState: state.gameState,
          combatState: state.combatState,
          partyLength: state.party.length,
          hasUsableCombatActor: view.hasUsableCombatActor,
          savedGameState: saved.gameState,
          savedCombatState: saved.combatState,
        };
      }));
    }

    expect(results).toEqual([
      {
        gameState: 'explore',
        combatState: null,
        partyLength: 0,
        hasUsableCombatActor: false,
        savedGameState: 'explore',
        savedCombatState: null,
      },
      {
        gameState: 'explore',
        combatState: null,
        partyLength: 0,
        hasUsableCombatActor: false,
        savedGameState: 'explore',
        savedCombatState: null,
      },
      {
        gameState: 'explore',
        combatState: null,
        partyLength: 1,
        hasUsableCombatActor: false,
        savedGameState: 'explore',
        savedCombatState: null,
      },
    ]);
  });
}

for (const vp of VIEWPORTS) {
  test(`Combat callbacks fail closed after navigation and invalid context at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext, menuHistory, goBackSubmenu } = await import('/src/navigation.js');
      const { combatCallbacks, combatSelection } = await import('/src/combat_ui/combat_state.js');
      const { selectCombatAction } = await import('/src/combat.js');
      const { getScreenViewState } = await import('/src/state/view_state.js');

      const reset = (spells = ['HALITO']) => {
        const actor = createSoloCharacter('Priest');
        actor.spells = spells;
        state.party = [actor];
        state.inventory = ['HEAL_POTION'];
        state.combatState = {
          phase: 'choose_actions',
          monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }],
        };
        state.gameState = 'combat';
        state.transitioning = false;
        menuContext.type = '';
        menuContext.actorIdx = -1;
        menuContext.targetType = '';
        menuContext.spellName = '';
        menuContext.prevGameState = null;
        menuHistory.length = 0;
        combatSelection.charIdx = 0;
        combatSelection.actions = [];
        combatCallbacks.activeTargetCallback = null;
        combatCallbacks.activeSpellCallback = null;
        combatCallbacks.activeItemCallback = null;
      };

      reset();
      selectCombatAction('fight');
      const staleFightCallback = combatCallbacks.activeTargetCallback;
      goBackSubmenu();
      staleFightCallback?.(0);
      const staleAfterBack = {
        actionCount: combatSelection.actions.length,
        gameState: state.gameState,
        previousGameState: menuContext.prevGameState,
      };

      reset();
      selectCombatAction('spell');
      const spellCallback = combatCallbacks.activeSpellCallback;
      spellCallback?.('HALITO');
      const nestedTargetCallback = combatCallbacks.activeTargetCallback;
      goBackSubmenu();
      nestedTargetCallback?.(0);
      const afterNestedBack = {
        actionCount: combatSelection.actions.length,
        menuType: menuContext.type,
      };
      goBackSubmenu();
      spellCallback?.('HALITO');
      const afterParentClose = {
        actionCount: combatSelection.actions.length,
        gameState: state.gameState,
        previousGameState: menuContext.prevGameState,
      };

      reset(['DUMAPIC']);
      const mpBeforeUtility = state.party[0].mp;
      selectCombatAction('spell');
      const utilityCallback = combatCallbacks.activeSpellCallback;
      utilityCallback?.('DUMAPIC');
      const utilityTargetView = getScreenViewState(state, {
        ...menuContext,
        type: 'combat_target',
        targetType: 'enemy',
        spellName: 'DUMAPIC',
      });
      const utilityResult = {
        actionCount: combatSelection.actions.length,
        mp: state.party[0].mp,
        mpBefore: mpBeforeUtility,
        menuType: menuContext.type,
        targetUsable: utilityTargetView.isUsableCombatOverlaySubmenu,
      };

      reset();
      selectCombatAction('fight');
      const invalidTargetCallback = combatCallbacks.activeTargetCallback;
      state.combatState.monsters[0].hp = 0;
      invalidTargetCallback?.(-1);
      invalidTargetCallback?.(99);
      invalidTargetCallback?.(0);
      const invalidTargetResult = {
        actionCount: combatSelection.actions.length,
        gameState: state.gameState,
      };

      reset();
      selectCombatAction('fight');
      const invalidActorCallback = combatCallbacks.activeTargetCallback;
      state.party[0] = null;
      invalidActorCallback?.(0);
      const invalidActorResult = {
        actionCount: combatSelection.actions.length,
        gameState: state.gameState,
      };

      return { staleAfterBack, afterNestedBack, afterParentClose, utilityResult, invalidTargetResult, invalidActorResult };
    });

    expect(result).toEqual({
      staleAfterBack: { actionCount: 0, gameState: 'combat', previousGameState: null },
      afterNestedBack: { actionCount: 0, menuType: 'combat_spell' },
      afterParentClose: { actionCount: 0, gameState: 'combat', previousGameState: null },
      utilityResult: { actionCount: 0, mp: 13, mpBefore: 13, menuType: 'combat_spell', targetUsable: false },
      invalidTargetResult: { actionCount: 0, gameState: 'submenu' },
      invalidActorResult: { actionCount: 0, gameState: 'submenu' },
    });
  });
}

for (const vp of VIEWPORTS) {
  test(`Missing combat data disables combat UI paths at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      const { updateUI } = await import('/src/ui.js');

      const combatControls = document.getElementById('combat-controls');
      const combatOverlay = document.getElementById('combat-overlay');
      const controlsPanel = document.getElementById('controls-panel');
      const snapshot = () => ({
        gameState: state.gameState,
        combatState: state.combatState,
        menuType: menuContext.type,
        combatControlsActive: combatControls.classList.contains('active'),
        combatMode: controlsPanel.classList.contains('combat-mode'),
        overlayDisplay: combatOverlay.style.display,
        overlayChildren: combatOverlay.children.length,
      });

      const sparseMonsters = [];
      sparseMonsters.length = 1;
      const invalidCombatCases = [
        { label: 'empty', monsters: [] },
        { label: 'null', monsters: [null] },
        { label: 'scalar', monsters: ['monster'] },
        { label: 'sparse', monsters: sparseMonsters },
      ];
      const invalidCombatResults = invalidCombatCases.map(({ label, monsters }) => {
        state.gameState = 'combat';
        state.combatState = { phase: 'choose_actions', monsters };
        menuContext.type = '';
        updateUI();
        document.getElementById('btn-combat-fight').click();
        const explicitCombat = snapshot();

        state.gameState = 'submenu';
        state.combatState = { phase: 'choose_actions', monsters };
        menuContext.type = 'combat_target';
        menuContext.targetType = 'enemy';
        updateUI();
        renderCombatOverlay();
        document.getElementById('btn-combat-fight').click();
        const targetSubmenu = snapshot();

        return { label, hasOwnFirstMonster: Object.hasOwn(monsters, 0), explicitCombat, targetSubmenu };
      });

      const partyCases = [
        { label: 'missing', party: null },
        { label: 'sparse', party: Object.assign([], { length: 1 }) },
        { label: 'all-dead', party: [{ ...createSoloCharacter('Fighter'), status: 'dead' }] },
      ];
      const invalidPartyResults = partyCases.map(({ label, party }) => {
        state.party = party;
        state.gameState = 'combat';
        state.combatState = { phase: 'choose_actions', monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }] };
        menuContext.type = '';
        menuContext.prevGameState = null;
        let error = null;
        try {
          updateUI();
        } catch (caught) {
          error = caught.message;
        }
        return {
          label,
          error,
          promptText: document.getElementById('combat-prompt').textContent,
          combatControlsActive: combatControls.classList.contains('active'),
          combatMode: controlsPanel.classList.contains('combat-mode'),
          overlayDisplay: combatOverlay.style.display,
        };
      });

      return { invalidCombatResults, invalidPartyResults };
    });

    for (const { label, hasOwnFirstMonster, explicitCombat, targetSubmenu } of result.invalidCombatResults) {
      expect(label).toBeDefined();
      expect(hasOwnFirstMonster).toBe(label === 'null' || label === 'scalar');
      expect(explicitCombat).toMatchObject({
        gameState: 'combat',
        menuType: '',
        combatControlsActive: false,
        combatMode: false,
        overlayDisplay: 'none',
        overlayChildren: 0,
      });
      expect(targetSubmenu).toMatchObject({
        gameState: 'submenu',
        menuType: 'combat_target',
        combatControlsActive: false,
        combatMode: false,
        overlayDisplay: 'none',
        overlayChildren: 0,
      });
    }
    expect(result.invalidPartyResults).toEqual([
      {
        label: 'missing',
        error: null,
        promptText: '',
        combatControlsActive: false,
        combatMode: false,
        overlayDisplay: 'none',
      },
      {
        label: 'sparse',
        error: null,
        promptText: '',
        combatControlsActive: false,
        combatMode: false,
        overlayDisplay: 'none',
      },
      {
        label: 'all-dead',
        error: null,
        promptText: '',
        combatControlsActive: false,
        combatMode: false,
        overlayDisplay: 'none',
      },
    ]);
  });
}

for (const vp of VIEWPORTS) {
  test(`Combat overlays reject resolving and transitioning clicks at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { createSoloCharacter, state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { combatCallbacks } = await import('/src/combat_ui/combat_state.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');

      state.party = [createSoloCharacter('Priest')];
      state.party[0].spells = ['HALITO'];
      state.inventory = ['HEAL_POTION'];
      state.gameState = 'submenu';
      state.transitioning = false;
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: 'Biter', hp: 10, maxHp: 10 }],
      };
      menuContext.prevGameState = 'combat';

      const rejected = [];
      const rejectClick = (type, selector, callbackKey, phase, transitioning) => {
        menuContext.type = type;
        menuContext.targetType = type === 'combat_target' ? 'enemy' : '';
        menuContext.actorIdx = 0;
        menuContext.spellName = '';
        combatCallbacks[callbackKey] = () => rejected.push(type);
        renderCombatOverlay();
        const card = document.querySelector(`#combat-overlay ${selector}`);
        state.combatState.phase = phase;
        state.transitioning = transitioning;
        card?.click();
      };

      rejectClick('combat_target', '.combat-target-card.enemy', 'activeTargetCallback', 'resolving', false);
      rejectClick('combat_spell', '.combat-item-card.spell', 'activeSpellCallback', 'choose_actions', true);
      rejectClick('combat_item', '.combat-item-card.item', 'activeItemCallback', 'resolving', false);

      return {
        rejected,
        gameState: state.gameState,
        phase: state.combatState.phase,
        transitioning: state.transitioning,
      };
    });

    expect(result).toEqual({
      rejected: [],
      gameState: 'submenu',
      phase: 'resolving',
      transitioning: false,
    });
  });
}

for (const vp of VIEWPORTS) {
  test(`Malformed active-map combat stays out of renderer and viewport HUD at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { getScreenViewState } = await import('/src/state/view_state.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const { updateViewportHUD } = await import('/src/ui/viewport_hud.js');

      state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
      state.x = 0;
      state.y = 0;
      state.gameState = 'explore';
      state.combatState = null;
      menuContext.type = '';
      updateViewportHUD();

      state.gameState = 'combat';
      state.combatState = { phase: 'choose_actions', monsters: [null] };
      const view = getScreenViewState(state, menuContext);
      const visibility = dungeonRenderer.getSceneVisibility();
      const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;
      const originalDrawMiniMap = dungeonRenderer.drawMiniMap;
      let drawError = null;
      dungeonRenderer.draw3DCorridors = () => {};
      dungeonRenderer.drawMiniMap = () => {};
      try {
        dungeonRenderer.getDrawSignature(visibility);
        dungeonRenderer.draw(visibility);
      } catch (error) {
        drawError = error.message;
      } finally {
        dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;
        dungeonRenderer.drawMiniMap = originalDrawMiniMap;
      }
      updateViewportHUD();

      return {
        hasCombat: view.hasCombat,
        showCombat: visibility.showCombat,
        hudDisplay: document.getElementById('viewport-hud').style.display,
        drawError,
      };
    });

    expect(result).toEqual({
      hasCombat: false,
      showCombat: false,
      hudDisplay: 'none',
      drawError: null,
    });
  });
}

for (const vp of VIEWPORTS) {
  test(`Malformed map keeps solo_start on the safe town scene at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { getScreenViewState } = await import('/src/state/view_state.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const { updateViewportHUD } = await import('/src/ui/viewport_hud.js');

      state.gameState = 'submenu';
      state.floor = 1;
      state.combatState = null;
      menuContext.type = 'solo_start';
      menuContext.prevGameState = 'town';
      const malformedMaps = [
        { label: 'object', map: { stale: true } },
        { label: 'null-row', map: [null] },
        { label: 'empty-row', map: [[]] },
        { label: 'null-cell', map: [[null]] },
        { label: 'partial-cell', map: [[{ type: 'empty' }]] },
      ];
      const malformedMapResults = malformedMaps.map(({ label, map }) => {
        state.maps[0] = map;
        const view = getScreenViewState(state, menuContext);
        const visibility = dungeonRenderer.getSceneVisibility();
        const originalDrawTownBackground = dungeonRenderer.drawTownBackground;
        const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;
        let townDraws = 0;
        let corridorDraws = 0;
        dungeonRenderer.drawTownBackground = (...args) => {
          townDraws++;
          return originalDrawTownBackground.apply(dungeonRenderer, args);
        };
        dungeonRenderer.draw3DCorridors = (...args) => {
          corridorDraws++;
          return originalDraw3DCorridors.apply(dungeonRenderer, args);
        };
        let drawError = null;
        try {
          dungeonRenderer.draw(visibility);
        } catch (error) {
          drawError = error.message;
        } finally {
          dungeonRenderer.drawTownBackground = originalDrawTownBackground;
          dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;
        }
        updateViewportHUD();

        return {
          label,
          hasMap: view.hasMap,
          showTownBackground: visibility.showTownBackground,
          townDraws,
          corridorDraws,
          hudDisplay: document.getElementById('viewport-hud').style.display,
          drawError,
        };
      });
      state.maps[0] = [[{ type: 'empty', walls: [false, false, false, false] }]];
      state.x = 1;
      state.y = 0;
      const currentCellView = getScreenViewState(state, menuContext);
      const currentCellVisibility = dungeonRenderer.getSceneVisibility();
      updateViewportHUD();

      return {
        malformedMapResults,
        currentCell: {
          hasMap: currentCellView.hasMap,
          hasCurrentCell: currentCellView.hasCurrentCell,
          showTownBackground: currentCellVisibility.showTownBackground,
          hudDisplay: document.getElementById('viewport-hud').style.display,
        },
      };
    });

    expect(result.malformedMapResults).toHaveLength(5);
    for (const malformed of result.malformedMapResults) {
      expect(malformed).toMatchObject({
        hasMap: false,
        showTownBackground: true,
        townDraws: 1,
        corridorDraws: 0,
        hudDisplay: 'none',
        drawError: null,
      });
    }
    expect(result.currentCell).toEqual({
      hasMap: true,
      hasCurrentCell: false,
      showTownBackground: false,
      hudDisplay: 'none',
    });
  });
}

test('Combat autosave resumes action selection without persisting resolving phase', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /戦士/ }).click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await expect(page.locator('#explore-controls')).toBeVisible();

  const beforeReload = await page.evaluate(async () => {
    const { startCombat } = await import('/src/combat.js');
    const { state } = await import('/src/state.js');
    startCombat(false, false);
    const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
    return {
      live: {
        gameState: state.gameState,
        phase: state.combatState.phase,
        monsters: state.combatState.monsters.map(({ name, hp }) => ({ name, hp })),
      },
      saved: {
        gameState: saved.gameState,
        phase: saved.combatState.phase,
        monsters: saved.combatState.monsters.map(({ name, hp }) => ({ name, hp })),
      },
    };
  });

  expect(beforeReload.live.gameState).toBe('combat');
  expect(beforeReload.live.phase).toBe('choose_actions');
  expect(beforeReload.saved).toEqual(beforeReload.live);

  await page.reload();

  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      phase: state.combatState?.phase,
      monsters: state.combatState?.monsters.map(({ name, hp }) => ({ name, hp })),
      logCount: state.logs.length,
    };
  });
  expect(resumed.gameState).toBe('combat');
  expect(resumed.phase).toBe('choose_actions');
  expect(resumed.monsters).toEqual(beforeReload.live.monsters);
  await expect(page.locator('#combat-controls')).toHaveClass(/active/);

  await page.locator('#btn-combat-fight').click();
  await expect(page.locator('#combat-overlay')).toBeVisible();
  await page.locator('#combat-overlay .combat-target-card.enemy:not(.dead)').first().click();

  const duringResolution = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
    return {
      livePhase: state.combatState?.phase,
      savedPhase: saved.combatState?.phase,
      logCount: state.logs.length,
    };
  });
  expect(duringResolution.livePhase).toBe('resolving');
  expect(duringResolution.savedPhase).toBe('choose_actions');
  expect(duringResolution.logCount).toBeGreaterThan(resumed.logCount);
});

test('Round resolution autosave preserves resolved party and monster HP on reload', async ({ page }) => {
  await startSoloRun(page);

  const resolved = await page.evaluate(async () => {
    const { startCombat, resolveCombatRound, combatSelection } = await import('/src/combat.js');
    const { state } = await import('/src/state.js');
    startCombat(false, false);
    state.combatState.monsters = [state.combatState.monsters[0]];
    Object.assign(state.combatState.monsters[0], {
      hp: 50,
      maxHp: 50,
      str: 1,
      status: 'poisoned',
      traits: [],
    });
    Object.assign(state.party[0], {
      hp: state.party[0].maxHp,
      status: 'poisoned',
    });
    const before = {
      partyHp: state.party[0].hp,
      monsterHp: state.combatState.monsters[0].hp,
    };
    combatSelection.charIdx = 1;
    combatSelection.actions = [{ type: 'defend', actorIdx: 0 }];
    Math.random = () => 0.99;
    resolveCombatRound();
    const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
    return {
      before,
      live: {
        partyHp: state.party[0].hp,
        monsterHp: state.combatState.monsters[0].hp,
        phase: state.combatState.phase,
        pendingOutcome: state.combatState.pendingOutcome,
      },
      saved: {
        partyHp: saved.party[0].hp,
        monsterHp: saved.combatState.monsters[0].hp,
        phase: saved.combatState.phase,
        pendingOutcome: saved.combatState.pendingOutcome,
      },
    };
  });

  expect(resolved.live.partyHp).toBeLessThan(resolved.before.partyHp);
  expect(resolved.live.monsterHp).toBeLessThan(resolved.before.monsterHp);
  expect(resolved.saved.partyHp).toBe(resolved.live.partyHp);
  expect(resolved.saved.monsterHp).toBe(resolved.live.monsterHp);
  expect(resolved.saved.pendingOutcome).toBe(resolved.live.pendingOutcome);
  expect(resolved.live.phase).toBe('resolving');
  expect(resolved.saved.phase).toBe('choose_actions');
  expect(resolved.saved.pendingOutcome).toBeNull();

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      partyHp: state.party[0].hp,
      monsterHp: state.combatState?.monsters[0].hp,
      phase: state.combatState?.phase,
    };
  });
  expect(resumed).toEqual({
    gameState: 'combat',
    partyHp: resolved.live.partyHp,
    monsterHp: resolved.live.monsterHp,
    phase: 'choose_actions',
  });
});

test('Victory outcome resumes once with EXP and materials preserved', async ({ page }) => {
  await startSoloRun(page);

  const before = await page.evaluate(async () => {
    const { startCombat, resolveCombatRound, combatSelection } = await import('/src/combat.js');
    const { state } = await import('/src/state.js');
    startCombat(false, false);
    state.combatState.monsters = [state.combatState.monsters[0]];
    Object.assign(state.combatState.monsters[0], {
      hp: 1,
      maxHp: 1,
      exp: 37,
      isRare: true,
      traits: [],
    });
    Object.assign(state.party[0], {
      str: 999,
      agi: 999,
      status: 'ok',
    });
    const baseline = {
      exp: state.party[0].exp,
      blackHorn: state.currentRun.materials['黒角'] || 0,
      kills: state.currentRun.kills,
    };
    combatSelection.charIdx = 1;
    combatSelection.actions = [{ type: 'fight', actorIdx: 0, targetIdx: 0 }];
    Math.random = () => 0.99;
    resolveCombatRound();
    return baseline;
  });

  await expect.poll(
    () => page.evaluate(async () => (await import('/src/state.js')).state.transitioning),
    { timeout: 15000 }
  ).toBe(true);

  const awarded = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
    return {
      live: {
        exp: state.party[0].exp,
        blackHorn: state.currentRun.materials['黒角'] || 0,
        kills: state.currentRun.kills,
        pendingOutcome: state.combatState.pendingOutcome,
      },
      saved: {
        exp: saved.party[0].exp,
        blackHorn: saved.currentRun.materials['黒角'] || 0,
        kills: saved.currentRun.kills,
        pendingOutcome: saved.combatState.pendingOutcome,
        phase: saved.combatState.phase,
      },
    };
  });
  expect(awarded.live.exp).toBeGreaterThan(before.exp);
  expect(awarded.live.blackHorn).toBe(before.blackHorn + 1);
  expect(awarded.live.kills).toBe(before.kills + 1);
  expect(awarded.saved).toEqual({ ...awarded.live, phase: 'choose_actions' });
  expect(awarded.saved.pendingOutcome).toEqual({ kind: 'endCombat' });

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      exp: state.party[0].exp,
      blackHorn: state.currentRun.materials['黒角'] || 0,
      kills: state.currentRun.kills,
    };
  });
  expect(resumed).toEqual({
    gameState: 'explore',
    combatState: null,
    exp: awarded.live.exp,
    blackHorn: awarded.live.blackHorn,
    kills: awarded.live.kills,
  });
});

test('giveKey outcome reload before reward log applies missing rewards once', async ({ page }) => {
  await startSoloRun(page);
  const playback = await beginPendingOutcomePlayback(page, 'giveKey');
  expect(playback.transitioning).toBe(false);
  expect(playback.pendingOutcome).toEqual({ kind: 'giveKey', rewardsApplied: false });
  expect(playback.savedPhase).toBe('choose_actions');

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      keyCount: state.inventory.filter(item => (
        (typeof item === 'object' ? item.baseId : item) === 'DRAGON_KEY'
      )).length,
      rareEquipmentCount: state.inventory.filter(item => (
        typeof item === 'object' && item.kind === 'equipment' && item.rarity === 'rare'
      )).length,
      runEquipmentCount: state.currentRun.equipmentFound.length,
      blackHorn: state.currentRun.materials['黒角'] || 0,
      keyFoundCount: state.currentRun.itemsFound.filter(item => item === 'DRAGON_KEY').length,
      cellEvent: state.map[state.y][state.x].event,
    };
  });
  expect(resumed).toEqual({
    gameState: 'explore',
    combatState: null,
    keyCount: 1,
    rareEquipmentCount: 1,
    runEquipmentCount: 1,
    blackHorn: 2,
    keyFoundCount: 1,
    cellEvent: null,
  });
});

test('giveKey outcome reload after reward log does not duplicate rewards', async ({ page }) => {
  await startSoloRun(page);
  const playback = await beginPendingOutcomePlayback(page, 'giveKey');
  expect(playback.pendingOutcome).toEqual({ kind: 'giveKey', rewardsApplied: false });

  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.combatState?.pendingOutcome?.rewardsApplied;
  })).toBe(true);

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      keyCount: state.inventory.filter(item => (
        (typeof item === 'object' ? item.baseId : item) === 'DRAGON_KEY'
      )).length,
      rareEquipmentCount: state.inventory.filter(item => (
        typeof item === 'object' && item.kind === 'equipment' && item.rarity === 'rare'
      )).length,
      runEquipmentCount: state.currentRun.equipmentFound.length,
      blackHorn: state.currentRun.materials['黒角'] || 0,
      keyFoundCount: state.currentRun.itemsFound.filter(item => item === 'DRAGON_KEY').length,
      cellEvent: state.map[state.y][state.x].event,
    };
  });
  expect(resumed).toEqual({
    gameState: 'explore',
    combatState: null,
    keyCount: 1,
    rareEquipmentCount: 1,
    runEquipmentCount: 1,
    blackHorn: 2,
    keyFoundCount: 1,
    cellEvent: null,
  });
});

test('milestoneVictory outcome reload before reward log applies missing rewards once', async ({ page }) => {
  await startSoloRun(page);
  const playback = await beginPendingOutcomePlayback(page, 'milestoneVictory', 5);
  expect(playback.transitioning).toBe(false);
  expect(playback.pendingOutcome).toEqual({
    kind: 'milestoneVictory',
    floor: 5,
    rewardsApplied: false,
  });
  expect(playback.savedPhase).toBe('choose_actions');

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      defeatedMilestones: state.currentRun.defeatedMilestones,
      unlockedMilestones: state.unlockedMilestones,
      keyItems: state.keyItems,
      cellEvent: state.map[state.y][state.x].event,
    };
  });
  expect(resumed).toEqual({
    gameState: 'explore',
    combatState: null,
    defeatedMilestones: [5],
    unlockedMilestones: [5],
    keyItems: ['FORGE_SEAL'],
    cellEvent: null,
  });
});

test('milestoneVictory outcome reload after reward log does not duplicate rewards', async ({ page }) => {
  await startSoloRun(page);
  const playback = await beginPendingOutcomePlayback(page, 'milestoneVictory', 5);
  expect(playback.pendingOutcome).toEqual({
    kind: 'milestoneVictory',
    floor: 5,
    rewardsApplied: false,
  });

  await expect.poll(() => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return state.combatState?.pendingOutcome?.rewardsApplied;
  })).toBe(true);

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      defeatedMilestones: state.currentRun.defeatedMilestones,
      unlockedMilestones: state.unlockedMilestones,
      keyItems: state.keyItems,
      cellEvent: state.map[state.y][state.x].event,
    };
  });
  expect(resumed).toEqual({
    gameState: 'explore',
    combatState: null,
    defeatedMilestones: [5],
    unlockedMilestones: [5],
    keyItems: ['FORGE_SEAL'],
    cellEvent: null,
  });
});

test('triggerChest outcome reload enters the dropped chest screen', async ({ page }) => {
  await startSoloRun(page);
  const playback = await beginPendingOutcomePlayback(page, 'triggerChest');
  expect(playback.transitioning).toBe(true);
  expect(playback.pendingOutcome).toEqual({ kind: 'triggerChest' });

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      fromDrop: state.chestState?.fromDrop,
    };
  });
  expect(resumed).toEqual({
    gameState: 'submenu',
    combatState: null,
    fromDrop: true,
  });
  await expect(page.locator('#submenu-title')).toHaveText('宝箱の調査・解除');
});

test('Defeat during battle log playback reloads into game over', async ({ page }) => {
  await startSoloRun(page);
  const playback = await page.evaluate(async () => {
    const { state, saveAutosave } = await import('/src/state.js');
    const { startCombat, resolveCombatRound, combatSelection } = await import('/src/combat.js');
    startCombat(false, false);
    state.combatState.monsters = [state.combatState.monsters[0]];
    Object.assign(state.combatState.monsters[0], {
      hp: 100,
      maxHp: 100,
      str: 999,
      traits: [],
    });
    Object.assign(state.party[0], {
      hp: 1,
      agi: -999,
      status: 'ok',
    });
    combatSelection.charIdx = 1;
    combatSelection.actions = [{ type: 'defend', actorIdx: 0 }];
    saveAutosave();
    Math.random = () => 0.99;
    resolveCombatRound();
    const saved = JSON.parse(localStorage.getItem('mobile_wiz_rpg_autosave'));
    return {
      gameState: state.gameState,
      status: state.party[0].status,
      savedStatus: saved.party[0].status,
      savedPhase: saved.combatState.phase,
    };
  });
  expect(playback).toEqual({
    gameState: 'combat',
    status: 'dead',
    savedStatus: 'dead',
    savedPhase: 'choose_actions',
  });

  await page.reload();
  const resumed = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      gameState: state.gameState,
      combatState: state.combatState,
      status: state.party[0].status,
      returnReason: state.currentRun.returnReason,
    };
  });
  expect(resumed).toEqual({
    gameState: 'result',
    combatState: null,
    status: 'dead',
    returnReason: 'gameover',
  });
});

test('visibilitychange hidden saves only when no transition is active', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    state.transitioning = false;
    state.x += 1;
    const savedX = state.x;
    document.dispatchEvent(new Event('visibilitychange'));
    const savedAfterVisibleFlow = JSON.parse(
      localStorage.getItem('mobile_wiz_rpg_autosave')
    ).x;

    state.transitioning = true;
    state.x += 1;
    document.dispatchEvent(new Event('visibilitychange'));
    const savedDuringTransition = JSON.parse(
      localStorage.getItem('mobile_wiz_rpg_autosave')
    ).x;

    return { savedX, savedAfterVisibleFlow, savedDuringTransition };
  });
  expect(result.savedAfterVisibleFlow).toBe(result.savedX);
  expect(result.savedDuringTransition).toBe(result.savedX);
});

for (const vp of VIEWPORTS) {
  test(`Combat, chest, and event canvases hide the mini-map at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const { renderCombatOverlay } = await import('/src/combat_ui/combat_overlay.js');
      const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
      const labels = [];
      let miniMapDraws = 0;
      const originalFillText = ctx.fillText.bind(ctx);
      const originalDrawMiniMap = dungeonRenderer.drawMiniMap;
      const originalDraw3DCorridors = dungeonRenderer.draw3DCorridors;

      ctx.fillText = (text, ...args) => {
        labels.push({ text: String(text), x: args[0], y: args[1] });
        return originalFillText(text, ...args);
      };
      dungeonRenderer.drawMiniMap = () => { miniMapDraws++; };
      dungeonRenderer.draw3DCorridors = () => {};

      state.map = [[{ walls: [false, false, false, false], type: 'empty' }]];
      state.party = [{ name: '勇者', hp: 10, maxHp: 10, status: 'ok' }];
      state.combatState = {
        phase: 'choose_actions',
        monsters: Array.from({ length: 6 }, (_, index) => ({
          name: `敵${index + 1}`,
          level: 1,
          hp: 10,
          maxHp: 10,
          color: '#ff3b30',
          spriteType: 'biter',
          summonQueued: index < 3
        }))
      };

      state.gameState = 'combat';
      dungeonRenderer.draw();
      const combatLabels = [...labels];
      const combatMiniMapDraws = miniMapDraws;

      state.gameState = 'submenu';
      menuContext.type = 'combat_target';
      menuContext.targetType = 'enemy';
      menuContext.prevGameState = 'combat';
      dungeonRenderer.draw();
      const submenuMiniMapDraws = miniMapDraws;
      renderCombatOverlay();
      const targetCards = document.querySelectorAll('#combat-overlay .combat-target-card.enemy').length;
      const rowTags = document.querySelectorAll('#combat-overlay .enemy-row-tag').length;
      const monsterLabelCountBeforeExplore = labels.filter(label => label.text.includes('敵')).length;

      state.gameState = 'explore';
      menuContext.type = '';
      menuContext.prevGameState = null;
      dungeonRenderer.draw();
      const monsterLabelCountAfterExplore = labels.filter(label => label.text.includes('敵')).length;
      const exploreMiniMapDrawsBeforeItemMenu = miniMapDraws;

      state.gameState = 'submenu';
      menuContext.type = 'item_inventory';
      dungeonRenderer.draw();
      const itemMenuMiniMapDraws = miniMapDraws - exploreMiniMapDrawsBeforeItemMenu;

      state.gameState = 'explore';
      menuContext.type = '';
      dungeonRenderer.draw();
      const postItemMenuExploreMiniMapDraws = miniMapDraws - exploreMiniMapDrawsBeforeItemMenu;
      const exploreMiniMapDrawsBeforeChest = miniMapDraws;

      state.chestState = { trap: 'none' };
      state.gameState = 'chest';
      dungeonRenderer.draw();
      const chestMiniMapDraws = miniMapDraws - exploreMiniMapDrawsBeforeChest;

      state.gameState = 'submenu';
      menuContext.type = 'chest_menu';
      dungeonRenderer.draw();
      const chestSubmenuMiniMapDraws = miniMapDraws - exploreMiniMapDrawsBeforeChest;

      state.chestState = null;
      state.gameState = 'explore';
      menuContext.type = '';
      dungeonRenderer.draw();
      const postChestExploreMiniMapDraws = miniMapDraws - exploreMiniMapDrawsBeforeChest;

      miniMapDraws = 0;
      state.gameState = 'trap_encounter';
      dungeonRenderer.draw();
      const trapMiniMapDraws = miniMapDraws;

      const eventSubmenuTypes = [
        'event_spring',
        'event_camp',
        'event_tablet',
        'event_merchant',
        'event_merchant_buy',
        'milestone_merchant',
        'milestone_portal',
      ];
      const eventMiniMapDraws = {};
      state.gameState = 'submenu';
      for (const type of eventSubmenuTypes) {
        menuContext.type = type;
        dungeonRenderer.draw();
        eventMiniMapDraws[type] = miniMapDraws;
      }

      state.gameState = 'explore';
      menuContext.type = '';
      dungeonRenderer.draw();
      const postEventExploreMiniMapDraws = miniMapDraws;

      ctx.fillText = originalFillText;
      dungeonRenderer.drawMiniMap = originalDrawMiniMap;
      dungeonRenderer.draw3DCorridors = originalDraw3DCorridors;

      return {
        combatLabels,
        combatMiniMapDraws,
        submenuMiniMapDraws,
        itemMenuMiniMapDraws,
        postItemMenuExploreMiniMapDraws,
        exploreMiniMapDraws: postItemMenuExploreMiniMapDraws,
        chestMiniMapDraws,
        chestSubmenuMiniMapDraws,
        postChestExploreMiniMapDraws,
        trapMiniMapDraws,
        eventMiniMapDraws,
        postEventExploreMiniMapDraws,
        monsterLabelCountBeforeExplore,
        monsterLabelCountAfterExplore,
        targetCards,
        rowTags
      };
    });

    for (let index = 1; index <= 6; index++) {
      expect(result.combatLabels.some(label => label.text.includes(`敵${index}`))).toBe(true);
    }
    const topRowOmenLabels = result.combatLabels.filter(label => label.text.includes('召喚の予兆'));
    expect(topRowOmenLabels).toHaveLength(3);
    expect(topRowOmenLabels.every(label => label.y >= 10)).toBe(true);
    expect(result.combatMiniMapDraws).toBe(0);
    expect(result.submenuMiniMapDraws).toBe(0);
    expect(result.itemMenuMiniMapDraws).toBe(0);
    expect(result.postItemMenuExploreMiniMapDraws).toBe(1);
    expect(result.exploreMiniMapDraws).toBe(1);
    expect(result.chestMiniMapDraws).toBe(0);
    expect(result.chestSubmenuMiniMapDraws).toBe(0);
    expect(result.postChestExploreMiniMapDraws).toBe(1);
    expect(result.trapMiniMapDraws).toBe(0);
    expect(Object.values(result.eventMiniMapDraws)).toEqual(Array(7).fill(0));
    expect(result.postEventExploreMiniMapDraws).toBe(1);
    expect(result.monsterLabelCountAfterExplore).toBe(result.monsterLabelCountBeforeExplore);
    expect(result.targetCards).toBe(6);
    expect(result.rowTags).toBe(0);
  });
}
