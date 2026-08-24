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
    menuContext.prevGameState = null;
    menuHistory.length = 0;

    openSubmenu('combat_target', '攻撃対象を選択');
    const modalOpen = document.getElementById('combat-overlay').style.display === 'flex';
    goBackSubmenu();
    const restoredCombat = state.gameState === 'combat' && document.getElementById('combat-overlay').style.display === 'none';

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
      staleVisibility,
      restoredExplore: state.gameState === 'explore',
    };
  });

  expect(result.modalOpen).toBe(true);
  expect(result.restoredCombat).toBe(true);
  expect(result.staleVisibility.showCombat).toBe(false);
  expect(result.staleVisibility.showChest).toBe(false);
  expect(result.restoredExplore).toBe(true);
});

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
      dungeonRenderer.draw();
      const submenuMiniMapDraws = miniMapDraws;
      renderCombatOverlay();
      const targetCards = document.querySelectorAll('#combat-overlay .combat-target-card.enemy').length;
      const rowTags = document.querySelectorAll('#combat-overlay .enemy-row-tag').length;
      const monsterLabelCountBeforeExplore = labels.filter(label => label.text.includes('敵')).length;

      state.gameState = 'explore';
      menuContext.type = '';
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
