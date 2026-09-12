import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const ARCHETYPES = ['straight-corridor', 'dead-end', 'left-turn', 'right-turn', 't-junction', 'cross-junction'];
const PRODUCTION_FIXTURE = Object.freeze({ seed: 'ISSUE-1220-B1F-PRODUCTION', floor: 1, x: 6, y: 4, dir: 1 });

function makeSyntheticFixture(name) {
  return {
    name,
    map: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
    }))),
    paths: {
      'straight-corridor': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]],
      'dead-end': [],
      'left-turn': [[4, 4, 2], [4, 4, 3], [3, 4, 3]],
      'right-turn': [[4, 4, 2], [4, 4, 1], [5, 4, 1]],
      't-junction': [[4, 4, 2], [4, 4, 3], [4, 4, 1]],
      'cross-junction': [[4, 4, 2], [4, 4, 0], [4, 4, 3], [4, 4, 1], [4, 3, 0], [5, 4, 1], [3, 4, 3]],
    }[name],
  };
}

async function setState(page, { map, floor = 1, x = 4, y = 4, dir = 0, combatMonsters = null, targetSelection = false, danger = false }) {
  await page.evaluate(async ({ map, floor, x, y, dir, combatMonsters, targetSelection, danger }) => {
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const grid = map.grid || map;
    if (Array.isArray(map.paths)) {
      map.paths.forEach(([cellX, cellY, direction]) => {
        const [dx, dy] = directions[direction];
        grid[cellY][cellX].walls[direction] = false;
        if (grid[cellY + dy]?.[cellX + dx]) grid[cellY + dy][cellX + dx].walls[(direction + 2) % 4] = false;
      });
    }
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('scholar')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = floor; state.x = x; state.y = y; state.dir = dir;
    state.maps[floor - 1] = grid;
    state.visitedMaps[floor - 1] = grid.map((row) => row.map(() => true));
    state.map = grid; state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = combatMonsters ? 'combat' : 'explore';
    state.transitioning = false;
    state.combatState = combatMonsters ? { phase: 'choose_actions', monsters: combatMonsters } : null;
    state.roamingMonsters = danger ? [{ floor, x, y: Math.max(0, y - 1), kind: 'elite', perception: 'visible' }] : [];
    if (targetSelection && state.combatState) {
      state.gameState = 'submenu';
      menuContext.type = 'combat_target'; menuContext.targetType = 'enemy'; menuContext.prevGameState = 'combat';
    } else {
      menuContext.type = ''; menuContext.targetType = ''; menuContext.prevGameState = null;
    }
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
  }, { map: Array.isArray(map) ? map : { grid: map.map, paths: map.paths }, floor, x, y, dir, combatMonsters, targetSelection, danger });
}

async function configureSynthetic(page, archetype) {
  await setState(page, { map: makeSyntheticFixture(archetype) });
  return page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { state } = await import('/src/state.js');
    return {
      mode: dungeonRenderer.mode,
      topology: getVisibleCorridorTopology(state.map, state.x, state.y, state.dir),
      canvasSize: [document.querySelector('#dungeon-canvas').width, document.querySelector('#dungeon-canvas').height],
      childCount: dungeonRenderer.scene?.children.length ?? 0,
    };
  });
}

test('PixiJS 2.5D keeps Canvas screen-space topology readable at supported widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'pixi');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
    await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });
    for (const archetype of ARCHETYPES) {
      const evidence = await configureSynthetic(page, archetype);
      expect(evidence.mode).toBe('pixi');
      expect(evidence.canvasSize).toEqual([400, 260]);
      expect(evidence.childCount).toBeGreaterThan(0);
      const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`pixi-${archetype}-${viewport.width}px.png`) });
      await testInfo.attach(`pixi-${archetype}-${viewport.width}px`, { body: screenshot, contentType: 'image/png' });
    }
    await setState(page, { map: makeSyntheticFixture('left-turn'), floor: 6, x: 4, y: 4, dir: 0 });
    const archScreenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`pixi-arch-biome-${viewport.width}px.png`) });
    await testInfo.attach(`pixi-arch-biome-${viewport.width}px`, { body: archScreenshot, contentType: 'image/png' });
  }
});

test('PixiJS keeps production-backed B1F near side opening visible with minimap coexistence @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport); await page.goto('/?renderer=pixi');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
    const evidence = await page.evaluate(async (fixture) => {
      const { generateRunFloor } = await import('/src/run_map_generator.js');
      const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
      const generated = generateRunFloor({ runSeed: fixture.seed, floor: fixture.floor });
      const topology = getVisibleCorridorTopology(generated.grid, fixture.x, fixture.y, fixture.dir);
      return { generated: generated.grid, sideOpeningCount: topology.filter(({ z, column }) => z === 0 && Math.abs(column) === 1).length, forwardDepth: topology.filter(({ z, column }) => z > 0 && column === 0).length };
    }, PRODUCTION_FIXTURE);
    expect(evidence.sideOpeningCount).toBeGreaterThan(0); expect(evidence.forwardDepth).toBeGreaterThan(0);
    await setState(page, { map: evidence.generated, floor: 1, x: PRODUCTION_FIXTURE.x, y: PRODUCTION_FIXTURE.y, dir: PRODUCTION_FIXTURE.dir });
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
    const hidden = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`pixi-production-b1f-minimap-hidden-${viewport.width}px.png`) });
    await testInfo.attach(`pixi-production-b1f-minimap-hidden-${viewport.width}px`, { body: hidden, contentType: 'image/png' });
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'block'; });
    const visible = await page.locator('#viewport-panel').screenshot({ path: testInfo.outputPath(`pixi-production-b1f-minimap-visible-${viewport.width}px.png`) });
    await testInfo.attach(`pixi-production-b1f-minimap-visible-${viewport.width}px`, { body: visible, contentType: 'image/png' });
  }
});

test('Canvas baseline and Pixi candidate share the same state and viewport artifact naming @smoke @visual', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
  for (const renderer of ['canvas', 'pixi']) {
    await page.goto(renderer === 'pixi' ? '/?renderer=pixi' : '/');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', renderer);
    if (renderer === 'pixi') await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
    for (const archetype of ARCHETYPES) {
      await configureSynthetic(page, archetype);
      const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`${renderer}-${archetype}-390px.png`) });
      await testInfo.attach(`${renderer}-${archetype}-390px`, { body: screenshot, contentType: 'image/png' });
    }
  }
});

test('PixiJS preserves combat staging, target mapping, danger cue, resize, and lifecycle bounds @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  const monsters = [1, 2, 3].map((index) => ({ name: `Spike ${index}`, level: 1, hp: 10, maxHp: 10, color: '#58d6e8', spriteType: 'biter' }));
  await setState(page, { map: makeSyntheticFixture('straight-corridor'), combatMonsters: monsters, danger: true, targetSelection: true });
  const oneWay = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    state.map[3][4].blockEnter[2] = true;
    state.mapRevision += 1;
    dungeonRenderer.draw();
    return (await import('/src/rules/renderer_topology.js')).getVisibleCorridorTopology(state.map, state.x, state.y, state.dir)[0];
  });
  expect(oneWay.frontOneWayBarrier).toBe(true);
  await page.setViewportSize({ width: 430, height: 932 });
  expect(await page.locator('#dungeon-canvas').evaluate((canvas) => [canvas.width, canvas.height])).toEqual([400, 260]);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.locator('#dungeon-canvas').evaluate((canvas) => [canvas.width, canvas.height])).toEqual([400, 260]);
  await page.setViewportSize({ width: 390, height: 844 });
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput(); const layout = getCombatMonsterLayout(input.combatMonsters);
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const target = dungeonRenderer.getCombatTargetAtClientPoint(rect.left + rect.width * (layout[1].hitRegion.centerX / 400), rect.top + rect.height * (layout[1].hitRegion.centerY / 260), input);
    const before = { children: dungeonRenderer.scene.children.length, renders: dungeonRenderer.renderCount };
    dungeonRenderer.draw(input); dungeonRenderer.draw(input);
    const after = { children: dungeonRenderer.scene.children.length, renders: dungeonRenderer.renderCount };
    const initMs = dungeonRenderer.initializationCostMs;
    return { target, layoutCount: layout.length, before, after, initMs, destroyed: dungeonRenderer.resourceStats.destroyed };
  });
  expect(evidence.layoutCount).toBe(3); expect(evidence.target).toBe(1); expect(evidence.after.children).toBeLessThan(120);
  expect(evidence.after.renders).toBeGreaterThan(evidence.before.renders); expect(evidence.initMs).toBeGreaterThan(0);
  const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('pixi-combat-trio-target-danger.png') });
  await testInfo.attach('pixi-combat-trio-target-danger', { body: screenshot, contentType: 'image/png' });
  const destroyed = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.dispose();
    return dungeonRenderer.resourceStats.destroyed;
  });
  expect(destroyed).toBe(true);
});
