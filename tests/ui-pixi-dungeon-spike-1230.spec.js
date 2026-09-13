import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const ARCHETYPES = ['straight-corridor', 'dead-end', 'left-turn', 'right-turn', 't-junction', 'cross-junction'];
const PRODUCTION_FIXTURE = Object.freeze({ seed: 'ISSUE-1230-B1F-PRODUCTION', floor: 1, x: 6, y: 4, dir: 1 });
const EVIDENCE_DIR = process.env.PIXI_EVIDENCE_DIR || '';

function persistEvidence(name, buffer) {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(`${EVIDENCE_DIR}/${name}`, buffer);
}

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

async function hideHud(page) {
  await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
  await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });
}

test('PixiJS 2.5D keeps six navigation archetypes readable at every required width @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
    await hideHud(page);
    for (const archetype of ARCHETYPES) {
      await setState(page, { map: makeSyntheticFixture(archetype) });
      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        const { state } = await import('/src/state.js');
        const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
        return {
          mode: dungeonRenderer.mode,
          layers: Object.keys(dungeonRenderer.scene.layers),
          topology: getVisibleCorridorTopology(state.map, state.x, state.y, state.dir),
          children: dungeonRenderer.scene.children.length,
        };
      });
      expect(evidence.mode).toBe('pixi');
      expect(evidence.layers).toEqual(['background', 'far-environment', 'floor', 'structural-walls', 'environment-fx', 'actors', 'combat-fx', 'overlays']);
      expect(evidence.topology.length).toBeGreaterThan(0);
      expect(evidence.children).toBe(8);
      const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`pixi-${archetype}-${viewport.width}.png`) });
      await testInfo.attach(`pixi-${archetype}-${viewport.width}`, { body: screenshot, contentType: 'image/png' });
    }
  }
});

test('PixiJS motion uses projection continuity, restrained turns, and combat feedback @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await hideHud(page);
  await setState(page, { map: makeSyntheticFixture('straight-corridor') });
  const motion = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const rootSnapshot = (root) => ({
      x: root.position.x,
      y: root.position.y,
      rotation: root.rotation,
      scaleX: root.scale.x,
      scaleY: root.scale.y,
      alpha: root.alpha
    });
    const layerSnapshot = (root) => ({
      farEnvironmentY: root.layers['far-environment'].position.y,
      floorY: root.layers.floor.position.y,
      structuralWallsY: root.layers['structural-walls'].position.y,
      farEnvironmentX: root.layers['far-environment'].position.x,
      floorX: root.layers.floor.position.x,
      structuralWallsX: root.layers['structural-walls'].position.x
    });
    const inputBefore = dungeonRenderer.getRenderInput();
    dungeonRenderer.beginNavigationTransition('forward', inputBefore);
    state.y = 3;
    state.mapRevision += 1;
    menuContext.type = '';
    dungeonRenderer.update(0); dungeonRenderer.draw();
    const forwardStart = { progress: dungeonRenderer.transition?.elapsed ?? null, outgoingRoot: rootSnapshot(dungeonRenderer.transitionScene), incomingRoot: rootSnapshot(dungeonRenderer.scene), outgoingLayers: layerSnapshot(dungeonRenderer.transitionScene), incomingLayers: layerSnapshot(dungeonRenderer.scene) };
    dungeonRenderer.update(90); dungeonRenderer.draw();
    const forwardMid = { progress: dungeonRenderer.transition?.elapsed ?? null, outgoingRoot: rootSnapshot(dungeonRenderer.transitionScene), incomingRoot: rootSnapshot(dungeonRenderer.scene), outgoingLayers: layerSnapshot(dungeonRenderer.transitionScene), incomingLayers: layerSnapshot(dungeonRenderer.scene) };
    const forwardMidFrame = document.querySelector('#dungeon-canvas').toDataURL();
    dungeonRenderer.update(90); dungeonRenderer.draw();
    const forwardEnd = { active: Boolean(dungeonRenderer.transition), sceneY: dungeonRenderer.scene.position.y };
    dungeonRenderer.beginNavigationTransition('turn-left', dungeonRenderer.getRenderInput());
    state.dir = 3;
    state.mapRevision += 1;
    dungeonRenderer.update(80); dungeonRenderer.draw();
    const leftMid = { outgoingRoot: rootSnapshot(dungeonRenderer.transitionScene), incomingRoot: rootSnapshot(dungeonRenderer.scene), outgoingLayers: layerSnapshot(dungeonRenderer.transitionScene), incomingLayers: layerSnapshot(dungeonRenderer.scene) };
    const leftMidFrame = document.querySelector('#dungeon-canvas').toDataURL();
    dungeonRenderer.update(90); dungeonRenderer.draw();
    dungeonRenderer.beginNavigationTransition('turn-right', dungeonRenderer.getRenderInput());
    state.dir = 0;
    state.mapRevision += 1;
    dungeonRenderer.update(85); dungeonRenderer.draw();
    const rightMid = { outgoingRoot: rootSnapshot(dungeonRenderer.transitionScene), incomingRoot: rootSnapshot(dungeonRenderer.scene), outgoingLayers: layerSnapshot(dungeonRenderer.transitionScene), incomingLayers: layerSnapshot(dungeonRenderer.scene) };
    const rightMidFrame = document.querySelector('#dungeon-canvas').toDataURL();
    return { forwardStart, forwardMid, forwardEnd, leftMid, rightMid, forwardMidFrame, leftMidFrame, rightMidFrame };
  });
  for (const sample of [motion.forwardStart, motion.forwardMid, motion.leftMid, motion.rightMid]) {
    for (const root of [sample.outgoingRoot, sample.incomingRoot]) {
      expect(root.x).toBe(0);
      expect(root.y).toBe(0);
      expect(root.rotation).toBe(0);
      expect(root.scaleX).toBe(1);
      expect(root.scaleY).toBe(1);
    }
  }
  expect(motion.forwardMid.outgoingRoot.alpha).toBeGreaterThan(0);
  expect(motion.forwardMid.outgoingRoot.alpha).toBeLessThan(1);
  expect(Math.abs(motion.forwardMid.outgoingLayers.farEnvironmentY)).toBeLessThan(0.1);
  expect(motion.forwardEnd.active).toBe(false);
  expect(Math.abs(motion.leftMid.outgoingLayers.farEnvironmentX)).toBeLessThan(0.1);
  expect(Math.abs(motion.rightMid.incomingLayers.farEnvironmentX)).toBeLessThan(0.1);
  const forwardFrame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('pixi-forward-end-390.png') });
  await testInfo.attach('pixi-forward-end-390', { body: forwardFrame, contentType: 'image/png' });
  const forwardMidFrame = Buffer.from(motion.forwardMidFrame.split(',')[1], 'base64');
  await testInfo.attach('pixi-forward-mid-390', { body: forwardMidFrame, contentType: 'image/png' });
  persistEvidence('pixi-forward-mid-390.png', forwardMidFrame);
  const leftFrame = Buffer.from(motion.leftMidFrame.split(',')[1], 'base64');
  await testInfo.attach('pixi-left-turn-mid-390', { body: leftFrame, contentType: 'image/png' });
  persistEvidence('pixi-left-turn-mid-390.png', leftFrame);
  const rightFrame = Buffer.from(motion.rightMidFrame.split(',')[1], 'base64');
  await testInfo.attach('pixi-right-turn-mid-390', { body: rightFrame, contentType: 'image/png' });
  persistEvidence('pixi-right-turn-mid-390.png', rightFrame);
  const combatMonsters = [1, 2, 3].map((index) => ({ name: `Spike ${index}`, level: 1, hp: 10, maxHp: 10, color: '#58d6e8', spriteType: 'biter', chargeQueued: index === 2 }));
  await setState(page, { map: makeSyntheticFixture('straight-corridor'), combatMonsters, danger: true, targetSelection: true });
  const combat = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getCombatMonsterLayout } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput();
    dungeonRenderer.triggerCombatEntry();
    dungeonRenderer.triggerHitFeedback();
    dungeonRenderer.addDamageText('24');
    dungeonRenderer.update(80); dungeonRenderer.draw(input);
    const layers = Object.fromEntries(Object.entries(dungeonRenderer.scene.layers).map(([name, layer]) => [name, layer.children.length]));
    const layout = getCombatMonsterLayout(input.combatMonsters);
    const combatCounts = [1, 2, 3].map((count) => getCombatMonsterLayout(input.combatMonsters.slice(0, count)).length);
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const target = dungeonRenderer.getCombatTargetAtClientPoint(rect.left + rect.width * (layout[1].hitRegion.centerX / 400), rect.top + rect.height * (layout[1].hitRegion.centerY / 260), input);
    return { layers, target, combatCounts, combatEntry: dungeonRenderer.combatEntryTime, hitTime: dungeonRenderer.hitTime, damageTexts: dungeonRenderer.damageTexts.length, danger: input.dangerCue.active };
  });
  expect(combat.target).toBe(1);
  expect(combat.combatCounts).toEqual([1, 2, 3]);
  expect(combat.danger).toBe(true);
  expect(combat.layers.actors).toBeGreaterThan(0);
  expect(combat.layers['combat-fx']).toBeGreaterThan(0);
  expect(combat.combatEntry).toBeGreaterThan(0);
  expect(combat.hitTime).toBeGreaterThan(0);
  expect(combat.damageTexts).toBe(1);
  const combatFrame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('pixi-combat-entry-hit-danger-390.png') });
  await testInfo.attach('pixi-combat-entry-hit-danger-390', { body: combatFrame, contentType: 'image/png' });
});

test('Canvas and Pixi share identical deterministic states for visual A/B evidence @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const renderer of ['canvas', 'pixi']) {
    await page.goto(renderer === 'pixi' ? '/?renderer=pixi' : '/?renderer=canvas');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', renderer);
    await hideHud(page);
    await setState(page, { map: makeSyntheticFixture('straight-corridor') });
    const corridor = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`${renderer}-straight-390.png`) });
    await testInfo.attach(`${renderer}-straight-390`, { body: corridor, contentType: 'image/png' });
    const production = await page.evaluate(async (fixture) => {
      const { generateRunFloor } = await import('/src/run_map_generator.js');
      return generateRunFloor({ runSeed: fixture.seed, floor: fixture.floor }).grid;
    }, PRODUCTION_FIXTURE);
    await setState(page, { map: production, floor: 1, x: PRODUCTION_FIXTURE.x, y: PRODUCTION_FIXTURE.y, dir: PRODUCTION_FIXTURE.dir });
    const productionFrame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`${renderer}-production-b1f-390.png`) });
    await testInfo.attach(`${renderer}-production-b1f-390`, { body: productionFrame, contentType: 'image/png' });
  }
});

test('PixiJS material/atmosphere differs by biome and preserves production B1F/minimap @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await hideHud(page);
  await setState(page, { map: makeSyntheticFixture('left-turn'), floor: 1 });
  const flat = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('pixi-flat-biome-390.png') });
  await testInfo.attach('pixi-flat-biome-390', { body: flat, contentType: 'image/png' });
  await setState(page, { map: makeSyntheticFixture('left-turn'), floor: 6 });
  const arch = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('pixi-arch-biome-390.png') });
  await testInfo.attach('pixi-arch-biome-390', { body: arch, contentType: 'image/png' });
  const biomeEvidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    return { ceiling: dungeonRenderer.getRenderInput().visual.geometry.ceilingStyle, layerCount: dungeonRenderer.resourceStats.layerCount };
  });
  expect(biomeEvidence.ceiling).toBe('arch');
  expect(biomeEvidence.layerCount).toBe(8);

  const production = await page.evaluate(async (fixture) => {
    const { generateRunFloor } = await import('/src/run_map_generator.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const generated = generateRunFloor({ runSeed: fixture.seed, floor: fixture.floor });
    const topology = getVisibleCorridorTopology(generated.grid, fixture.x, fixture.y, fixture.dir);
    return { generated: generated.grid, sideOpeningCount: topology.filter(({ z, column }) => z === 0 && Math.abs(column) === 1).length, forwardDepth: topology.filter(({ z, column }) => z > 0 && column === 0).length };
  }, PRODUCTION_FIXTURE);
  expect(production.sideOpeningCount).toBeGreaterThan(0);
  expect(production.forwardDepth).toBeGreaterThan(0);
  await setState(page, { map: production.generated, floor: 1, x: PRODUCTION_FIXTURE.x, y: PRODUCTION_FIXTURE.y, dir: PRODUCTION_FIXTURE.dir });
  const productionFrame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('pixi-production-b1f-390.png') });
  await testInfo.attach('pixi-production-b1f-390', { body: productionFrame, contentType: 'image/png' });
  await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'block'; });
  const minimapFrame = await page.locator('#viewport-panel').screenshot({ path: testInfo.outputPath('pixi-production-b1f-minimap-390.png') });
  await testInfo.attach('pixi-production-b1f-minimap-390', { body: minimapFrame, contentType: 'image/png' });
});

test('PixiJS performance and lifecycle stay bounded across repeated transitions and disposal @smoke @e2e', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await hideHud(page);
  await setState(page, { map: makeSyntheticFixture('straight-corridor') });
  const evidence = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const renderer = dungeonRenderer;
    const input = renderer.getRenderInput();
    const before = JSON.stringify({ floor: state.floor, x: state.x, y: state.y, dir: state.dir, mapRevision: state.mapRevision, combatState: state.combatState });
    renderer.beginNavigationTransition('forward', input);
    renderer.update(45); renderer.draw(input);
    const stateUnchanged = before === JSON.stringify({ floor: state.floor, x: state.x, y: state.y, dir: state.dir, mapRevision: state.mapRevision, combatState: state.combatState });
    for (let index = 0; index < 20; index += 1) {
      renderer.beginNavigationTransition(index % 2 ? 'turn-left' : 'forward', input);
      renderer.update(90); renderer.draw(input);
      renderer.update(90); renderer.draw(input);
    }
    const repeated = {
      initializationCostMs: renderer.initializationCostMs,
      sceneChildren: renderer.scene.children.length,
      maxChildren: renderer.resourceStats.maxChildren,
      sceneRebuilds: renderer.resourceStats.sceneRebuilds,
      maxRenderMs: renderer.maxRenderMs,
      totalRenders: renderer.renderCount,
      generatedTextureCount: renderer.resourceStats.generatedTextureCount,
      filterCount: renderer.resourceStats.filterCount,
      listenerCount: renderer.resourceStats.listenerCount,
    };
    let disposed = 0;
    for (let index = 0; index < 5; index += 1) {
      const canvas = document.createElement('canvas');
      canvas.id = `pixi-lifecycle-probe-${index}`;
      document.body.appendChild(canvas);
      const { PixiDungeonRenderer: Renderer } = await import('/src/pixi_renderer.js');
      const candidate = new Renderer(canvas.id);
      await candidate.init();
      candidate.draw(input);
      candidate.dispose();
      if (candidate.resourceStats.destroyed) disposed += 1;
      canvas.remove();
    }
    return { repeated, disposed, stateUnchanged };
  });
  console.log(`[issue-1230] runtime ${JSON.stringify(evidence)}`);
  expect(evidence.repeated.sceneChildren).toBe(8);
  expect(evidence.repeated.maxChildren).toBeLessThan(12);
  expect(evidence.repeated.generatedTextureCount).toBe(0);
  expect(evidence.repeated.filterCount).toBe(0);
  expect(evidence.repeated.listenerCount).toBe(0);
  expect(evidence.repeated.totalRenders).toBeGreaterThan(20);
  expect(evidence.repeated.maxRenderMs).toBeLessThan(100);
  expect(evidence.stateUnchanged).toBe(true);
  expect(evidence.disposed).toBe(5);
});
