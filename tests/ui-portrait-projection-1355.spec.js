import { test, expect } from './fixtures/browser-health.js';
import { PORTRAIT_NEAR_COVERAGE_MIN } from '../src/rules/renderer_projection.js';

const PRIMARY = { width: 390, height: 844 };
const ARCHETYPES = ['straight-corridor', 'left-opening', 'right-opening', 't-junction', 'dead-end', 'intersection'];
const PATHS = {
  'straight-corridor': [[4, 4, 0], [4, 3, 0]],
  'left-opening': [[4, 4, 0], [4, 4, 3]],
  'right-opening': [[4, 4, 0], [4, 4, 1]],
  't-junction': [[4, 4, 0], [4, 4, 1], [4, 4, 3]],
  'dead-end': [],
  intersection: [[4, 4, 0], [4, 4, 1], [4, 4, 2], [4, 4, 3]],
};

function makeMap(archetype) {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: 'empty',
  })));
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [x, y, direction] of PATHS[archetype]) {
    const [dx, dy] = directions[direction];
    map[y][x].walls[direction] = false;
    if (map[y + dy]?.[x + dx]) map[y + dy][x + dx].walls[(direction + 2) % 4] = false;
  }
  return map;
}

async function seed(page, renderer, gameState = 'explore', map = makeMap('straight-corridor')) {
  await page.goto(`/?renderer=${renderer}`);
  if (renderer === 'pixi') await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ gameState, map }) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter(gameState === 'combat' ? 'arcana' : 'vanguard'), createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = map;
    state.maps[0] = map;
    state.visitedMap = map.map(row => row.map(() => true));
    state.visitedMaps[0] = state.visitedMap;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = gameState;
    state.transitioning = false;
    state.combatState = gameState === 'combat'
      ? { phase: 'choose_actions', monsters: [{ name: '検証敵', level: 1, hp: 100, maxHp: 100, magicResist: 0, color: '#00e5ff', spriteType: 'biter' }] }
      : null;
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.resize();
    dungeonRenderer.draw();
  }, { gameState, map });
  await page.waitForTimeout(80);
}

async function readProjection(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer, getProjectionColumn, getProjectionPlanes } = await import('/src/renderer.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const profile = dungeonRenderer.viewport;
    const projection = getProjectionPlanes(dungeonRenderer.getRenderInput().visual.geometry, profile);
    const topology = getVisibleCorridorTopology(state.map, state.x, state.y, state.dir)
      .map(({ z, column, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier }) => ({ z, column, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier }));
    const bounds = topology.reduce((result, { z, column }) => {
      if (Math.abs(column) === 2 && z < 2) return result;
      const plane = getProjectionColumn(projection, z, column);
      return {
        left: Math.min(result.left, plane.leftTop, plane.leftBottom, plane.rightTop, plane.rightBottom),
        right: Math.max(result.right, plane.leftTop, plane.leftBottom, plane.rightTop, plane.rightBottom),
      };
    }, { left: Infinity, right: -Infinity });
    const canvas = document.querySelector('#dungeon-canvas');
    return {
      orientation: profile.orientation,
      profile: { width: profile.width, height: profile.height, vanishingY: profile.vanishingPoint.y },
      canvas: [canvas.width, canvas.height],
      projection: { nearTop: projection.yt[0], nearBottom: projection.yb[0], farTop: projection.yt[4], farBottom: projection.yb[4] },
      nearCoverage: (projection.xr[0] - projection.xl[0]) / profile.width,
      bounds,
      topology,
      overflow: document.documentElement.scrollWidth,
    };
  });
}

async function canvasTargetPoint(page) {
  return page.evaluate(async () => {
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const rect = canvas.getBoundingClientRect();
    const profile = dungeonRenderer.viewport;
    const hitRegion = getCombatMonsterLayout(dungeonRenderer.getRenderInput().combatMonsters, profile)[0].hitRegion;
    const scale = Math.min(rect.width / profile.width, rect.height / profile.height);
    return {
      x: hitRegion.centerX * scale + (rect.width - profile.width * scale) / 2,
      y: hitRegion.centerY * scale + (rect.height - profile.height * scale) / 2,
    };
  });
}

test('Portrait projection shares geometry across Canvas and Pixi @smoke @visual', async ({ page }, testInfo) => {
  const evidence = {};
  for (const renderer of ['canvas', 'pixi']) {
    evidence[renderer] = {};
    await page.setViewportSize(PRIMARY);
    await seed(page, renderer);
    await page.locator('#viewport-hud').evaluate(element => { element.style.display = 'none'; });
    await page.locator('#dungeon-minimap-overlay').evaluate(element => { element.style.display = 'none'; });
    await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      dungeonRenderer.resize(400, 260);
      dungeonRenderer.draw();
    });
    const before = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1355-before-canonical-${renderer}-390.png`) });
    await testInfo.attach(`issue-1355-before-canonical-${renderer}-390`, { body: before, contentType: 'image/png' });
    await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      dungeonRenderer.resize();
      dungeonRenderer.draw();
    });
    await page.waitForTimeout(30);
    for (const archetype of ARCHETYPES) {
      await page.evaluate(async (map) => {
        const { state } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        state.map = map;
        state.maps[0] = map;
        state.visitedMap = map.map(row => row.map(() => true));
        state.visitedMaps[0] = state.visitedMap;
        state.mapRevision += 1;
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.resize();
        dungeonRenderer.draw();
      }, makeMap(archetype));
      await page.waitForTimeout(30);
      const current = await readProjection(page);
      evidence[renderer][archetype] = current;
      expect(current.orientation).toBe('portrait');
      expect(current.canvas[0]).toBeGreaterThanOrEqual(388);
      expect(current.canvas[1]).toBeGreaterThanOrEqual(843);
      expect(current.projection.nearBottom).toBeGreaterThan(260);
      expect(current.nearCoverage).toBeGreaterThanOrEqual(PORTRAIT_NEAR_COVERAGE_MIN);
      expect(current.profile.vanishingY / current.profile.height).toBeGreaterThan(0.35);
      expect(current.profile.vanishingY / current.profile.height).toBeLessThan(0.5);
      expect(current.bounds.left).toBeGreaterThanOrEqual(-1);
      expect(current.bounds.right).toBeLessThanOrEqual(current.profile.width + 1);
      expect(current.overflow).toBeLessThanOrEqual(PRIMARY.width + 1);
      const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1355-${renderer}-${archetype}-390.png`) });
      await testInfo.attach(`issue-1355-${renderer}-${archetype}-390`, { body: screenshot, contentType: 'image/png' });
    }
  }
  for (const archetype of ARCHETYPES) {
    expect(evidence.canvas[archetype].topology, `${archetype} Canvas/Pixi topology`).toEqual(evidence.pixi[archetype].topology);
  }
});

for (const renderer of ['canvas', 'pixi']) {
  test(`Portrait ${renderer} combat pointer keeps Fight and HALITO targets aligned @smoke @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(PRIMARY);
    await seed(page, renderer, 'combat');
    await page.locator('#btn-combat-fight').click();
    const fightFrame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1355-${renderer}-combat-fight-390.png`) });
    await testInfo.attach(`issue-1355-${renderer}-combat-fight-390`, { body: fightFrame, contentType: 'image/png' });
    await page.locator('#dungeon-canvas').click({ position: await canvasTargetPoint(page) });
    await expect.poll(() => page.evaluate(async () => (await import('/src/combat.js')).combatSelection.actions[0])).toMatchObject({ type: 'fight', targetIdx: 0 });

    await seed(page, renderer, 'combat');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.party[0].mp = state.party[0].maxMp = 10;
      (await import('/src/ui.js')).updateUI();
    });
    await page.locator('#btn-combat-spell').click();
    await page.locator('#combat-overlay .combat-item-card.spell', { has: page.locator('.spell-name', { hasText: /^HALITO$/ }) }).click();
    await page.locator('#dungeon-canvas').click({ position: await canvasTargetPoint(page) });
    await expect.poll(() => page.evaluate(async () => (await import('/src/combat.js')).combatSelection.actions[0])).toMatchObject({ type: 'spell', targetIdx: 0, spellName: 'HALITO' });
  });
}

for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 1024, height: 768 }]) {
  test(`Portrait projection remains usable at ${viewport.width}x${viewport.height} @smoke @visual`, async ({ page }, testInfo) => {
    for (const renderer of ['canvas', 'pixi']) {
      await page.setViewportSize(viewport);
      await seed(page, renderer);
      const current = await readProjection(page);
      const minimumWidth = viewport.width < 500 ? viewport.width - 2 : 300;
      expect(current.canvas[0]).toBeGreaterThanOrEqual(minimumWidth);
      expect(current.canvas[1]).toBeGreaterThanOrEqual(viewport.height - 2);
      expect(current.overflow).toBeLessThanOrEqual(viewport.width + 1);
      const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1355-${renderer}-${viewport.width}x${viewport.height}.png`) });
      await testInfo.attach(`issue-1355-${renderer}-${viewport.width}x${viewport.height}`, { body: screenshot, contentType: 'image/png' });
    }
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }]) {
  test(`Town vector background remains visible at ${viewport.width}x${viewport.height} @smoke @visual`, async ({ page }, testInfo) => {
    for (const renderer of ['canvas', 'pixi']) {
      await page.setViewportSize(viewport);
      await seed(page, renderer, 'town');
      const cyanPixels = await page.evaluate(() => {
        const canvas = document.querySelector('#dungeon-canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return { width: canvas.width, height: canvas.height, rightHalf: null };
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let rightHalf = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const x = (index / 4) % canvas.width;
          if (x < canvas.width / 2) continue;
          if (pixels[index + 1] > 100 && pixels[index + 2] > 100) rightHalf += 1;
        }
        return { width: canvas.width, height: canvas.height, rightHalf };
      });
      expect(cyanPixels.width).toBeGreaterThan(300);
      expect(cyanPixels.height).toBeGreaterThan(200);
      if (cyanPixels.rightHalf !== null) expect(cyanPixels.rightHalf).toBeGreaterThan(0);
      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`issue-1355-town-${renderer}-${viewport.width}x${viewport.height}.png`)
      });
      await testInfo.attach(`issue-1355-town-${renderer}-${viewport.width}x${viewport.height}`, { body: screenshot, contentType: 'image/png' });
    }
  });
}
