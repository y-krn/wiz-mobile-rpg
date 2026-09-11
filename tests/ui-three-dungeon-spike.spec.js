import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const ARCHETYPES = [
  'straight-corridor',
  'dead-end',
  'left-turn',
  'right-turn',
  't-junction',
  'cross-junction',
];

function installSpikeCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.id = 'three-dungeon-spike-canvas';
    canvas.setAttribute('aria-label', 'Three.js fixed-camera dungeon visual proof');
    canvas.style.display = 'block';
    canvas.style.width = 'min(400px, 100vw)';
    canvas.style.height = '260px';
    canvas.style.margin = '0 auto';
    document.body.replaceChildren(canvas);
  });
}

function createSyntheticMap(archetype) {
  return {
    archetype,
    map: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    }))),
    paths: {
      'straight-corridor': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]],
      'dead-end': [[4, 4, 2]],
      'left-turn': [[4, 4, 2], [4, 4, 3], [3, 4, 3]],
      'right-turn': [[4, 4, 2], [4, 4, 1], [5, 4, 1]],
      't-junction': [[4, 4, 2], [4, 4, 3], [4, 4, 1]],
      'cross-junction': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 4, 1], [4, 4, 3], [5, 4, 1], [3, 4, 3]],
    }[archetype],
  };
}

async function renderSynthetic(page, archetype) {
  return page.evaluate(async ({ fixture }) => {
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const open = (x, y, dir) => {
      const [dx, dy] = directions[dir];
      fixture.map[y][x].walls[dir] = false;
      fixture.map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
    };
    fixture.paths.forEach(([x, y, dir]) => open(x, y, dir));
    const { createThreeDungeonSpikeRenderer } = await import('/src/three_dungeon_spike.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const canvas = document.querySelector('#three-dungeon-spike-canvas');
    window.__threeDungeonSpike?.dispose();
    window.__threeDungeonSpike = createThreeDungeonSpikeRenderer(canvas);
    window.__threeDungeonSpike.renderMap(fixture.map, 4, 4, 0, getFloorTheme(1).visualSignature);
    return {
      camera: window.__threeDungeonSpike.getCameraContract(),
      surfaces: window.__threeDungeonSpike.getTopologySurfaces(),
    };
  }, { archetype, fixture: createSyntheticMap(archetype) });
}

test('Issue 1199 fixed-camera spike proves six truthful topology archetypes at mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await installSpikeCanvas(page);
    const contracts = [];

    for (const archetype of ARCHETYPES) {
      const evidence = await renderSynthetic(page, archetype);
      contracts.push(evidence.camera);
      const forbidden = evidence.surfaces.filter(({ surface }) => [
        'side-branch-mouth',
        'side-branch-floor',
        'side-branch-ceiling',
        'side-branch-wall-thickness',
        'ramp',
        'marker',
      ].some((term) => surface.includes(term)));
      expect(forbidden, `${archetype} must use real neighboring geometry only`).toEqual([]);
      expect(evidence.surfaces.filter(({ surface }) => surface === 'floor').length).toBeGreaterThan(0);
      expect(evidence.surfaces.filter(({ surface }) => surface === 'ceiling').length).toBeGreaterThan(0);
      expect(evidence.surfaces.every(({ y }) => Number.isFinite(y))).toBe(true);

      const screenshot = await page.locator('#three-dungeon-spike-canvas').screenshot({
        path: testInfo.outputPath(`issue-1199-${archetype}-${viewport.width}px.png`),
      });
      await testInfo.attach(`issue-1199-${archetype}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }

    expect(contracts).toEqual(contracts.map(() => contracts[0]));
  }
});

test('Issue 1199 production-backed B1F proof uses generated map and renderer-neutral topology @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await installSpikeCanvas(page);
  const evidence = await page.evaluate(async () => {
    const { generateRunFloor } = await import('/src/run_map_generator.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const { createThreeDungeonSpikeRenderer } = await import('/src/three_dungeon_spike.js');
    const generated = generateRunFloor({ runSeed: 'ISSUE-1199-B1F-PRODUCTION', floor: 1 });
    const grid = generated.grid;
    const candidates = [];
    for (let y = 0; y < grid.length; y += 1) {
      for (let x = 0; x < grid[y].length; x += 1) {
        for (let dir = 0; dir < 4; dir += 1) {
          const topology = getVisibleCorridorTopology(grid, x, y, dir);
          const current = topology.find((cell) => cell.z === 0 && cell.column === 0);
          const nearSideOpening = topology.some((cell) => cell.z === 0 && Math.abs(cell.column) === 1);
          const forwardDepth = topology.some((cell) => cell.z > 0 && cell.column === 0);
          if (current?.valid && nearSideOpening && forwardDepth) candidates.push({ x, y, dir, topology });
        }
      }
    }
    if (candidates.length === 0) throw new Error('deterministic B1F fixture has no near side opening');
    const fixture = candidates[0];
    const canvas = document.querySelector('#three-dungeon-spike-canvas');
    window.__threeDungeonSpike?.dispose();
    window.__threeDungeonSpike = createThreeDungeonSpikeRenderer(canvas);
    window.__threeDungeonSpike.renderMap(grid, fixture.x, fixture.y, fixture.dir, getFloorTheme(1).visualSignature);
    return {
      seed: 'ISSUE-1199-B1F-PRODUCTION',
      x: fixture.x,
      y: fixture.y,
      dir: fixture.dir,
      topology: fixture.topology.map(({ z, column, frontBlocked, leftBlocked, rightBlocked }) => ({ z, column, frontBlocked, leftBlocked, rightBlocked })),
      surfaces: window.__threeDungeonSpike.getTopologySurfaces(),
      camera: window.__threeDungeonSpike.getCameraContract(),
    };
  });

  expect(evidence.topology.some(({ z, column }) => z === 0 && Math.abs(column) === 1)).toBe(true);
  expect(evidence.topology.some(({ z, column }) => z > 0 && column === 0)).toBe(true);
  expect(evidence.surfaces.some(({ surface }) => surface === 'floor')).toBe(true);
  expect(evidence.surfaces.some(({ surface }) => surface === 'left-wall' || surface === 'right-wall')).toBe(true);
  const screenshot = await page.locator('#three-dungeon-spike-canvas').screenshot({
    path: testInfo.outputPath('issue-1199-production-b1f-390px.png'),
  });
  await testInfo.attach('issue-1199-production-b1f-390px', {
    body: screenshot,
    contentType: 'image/png',
  });
});
