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

const PRODUCTION_B1F_FIXTURE = Object.freeze({
  seed: 'ISSUE-1199-B1F-PRODUCTION',
  floor: 1,
  x: 6,
  y: 4,
  dir: 1,
});

function installSpikeCanvas(page, viewport) {
  return page.evaluate(({ width }) => {
    const canvas = document.createElement('canvas');
    canvas.id = 'three-dungeon-spike-canvas';
    canvas.setAttribute('aria-label', 'Three.js fixed-camera dungeon visual proof');
    canvas.style.display = 'block';
    canvas.style.width = `${width}px`;
    canvas.style.height = '260px';
    canvas.style.margin = '0 auto';
    document.body.replaceChildren(canvas);
  }, { width: viewport.width });
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
      'left-turn': [[4, 4, 2], [4, 4, 3], [3, 4, 3], [2, 4, 3]],
      'right-turn': [[4, 4, 2], [4, 4, 1], [5, 4, 1], [6, 4, 1]],
      't-junction': [[4, 4, 2], [4, 4, 3], [3, 4, 3], [2, 4, 3], [4, 4, 1], [5, 4, 1], [6, 4, 1]],
      'cross-junction': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0], [4, 4, 1], [5, 4, 1], [6, 4, 1], [4, 4, 3], [3, 4, 3], [2, 4, 3]],
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
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const canvas = document.querySelector('#three-dungeon-spike-canvas');
    window.__threeDungeonSpike?.dispose();
    window.__threeDungeonSpike = createThreeDungeonSpikeRenderer(canvas);
    window.__threeDungeonSpike.renderMap(fixture.map, 4, 4, 0, getFloorTheme(1).visualSignature);
    return {
      camera: window.__threeDungeonSpike.getCameraContract(),
      profile: window.__threeDungeonSpike.profile,
      map: fixture.map,
      topology: getVisibleCorridorTopology(fixture.map, 4, 4, 0),
      surfaces: window.__threeDungeonSpike.getTopologySurfaces(),
      frames: window.__threeDungeonSpike.getTopologyFrames(),
    };
  }, { archetype, fixture: createSyntheticMap(archetype) });
}

test('Issue 1199 fixed-camera spike proves six truthful topology archetypes at mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await installSpikeCanvas(page, viewport);
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
      expect(evidence.camera.aspect).toBeCloseTo(viewport.width / 260, 5);
      expect(evidence.camera.view).toEqual([viewport.width, 260]);
      const eyeMinZ = evidence.profile.startZ - evidence.profile.cellDepth / 2;
      const eyeMaxZ = evidence.profile.startZ + evidence.profile.cellDepth / 2;
      expect(evidence.camera.position[0]).toBe(0);
      expect(evidence.camera.position[2]).toBeGreaterThan(eyeMinZ);
      expect(evidence.camera.position[2]).toBeLessThan(eyeMaxZ);
      const downwardAngle = Math.atan2(
        evidence.camera.position[1] - evidence.camera.target[1],
        Math.abs(evidence.camera.target[2] - evidence.camera.position[2]),
      ) * 180 / Math.PI;
      expect(downwardAngle).toBeLessThan(20);

      const cells = evidence.topology.filter(({ valid }) => valid);
      const surfacesByCell = new Map();
      evidence.surfaces.forEach((surface) => {
        const key = `${surface.topology.z}:${surface.topology.column}`;
        const current = surfacesByCell.get(key) || [];
        current.push(surface.surface);
        surfacesByCell.set(key, current);
      });
      const framesByCell = new Map(evidence.frames.map(({ topology, frame }) => [
        `${topology.z}:${topology.column}`,
        frame,
      ]));
      expect(cells.every((cell) => {
        const surfaces = surfacesByCell.get(`${cell.z}:${cell.column}`) || [];
        return surfaces.includes('floor') && surfaces.includes('ceiling');
      })).toBe(true);
      cells.forEach((cell) => {
        const surfaces = surfacesByCell.get(`${cell.z}:${cell.column}`) || [];
        const frame = framesByCell.get(`${cell.z}:${cell.column}`);
        ['frontBlocked', 'backBlocked', 'leftBlocked', 'rightBlocked'].forEach((edge) => {
          const wall = `${edge.replace('Blocked', '')}-wall`;
          expect(surfaces.includes(wall), `${archetype} ${cell.z}:${cell.column} ${edge}`)
            .toBe(frame[edge]);
        });
      });
      const floorSurfaces = evidence.surfaces.filter(({ surface }) => surface === 'floor');
      const wallSurfaces = evidence.surfaces.filter(({ surface }) => surface.endsWith('-wall'));
      expect(new Set(floorSurfaces.map(({ y }) => y))).toEqual(new Set([0]));
      floorSurfaces.forEach((floor) => {
        const { bounds } = floor;
        const ceiling = evidence.surfaces.find(({ surface, topology }) =>
          surface === 'ceiling' && topology.z === floor.topology.z && topology.column === floor.topology.column
        );
        expect(ceiling.bounds.minX).toBeCloseTo(bounds.minX, 5);
        expect(ceiling.bounds.maxX).toBeCloseTo(bounds.maxX, 5);
        expect(ceiling.bounds.minZ).toBeCloseTo(bounds.minZ, 5);
        expect(ceiling.bounds.maxZ).toBeCloseTo(bounds.maxZ, 5);

        const edges = [
          { axis: 'x', value: bounds.minX, spanMin: bounds.minZ, spanMax: bounds.maxZ },
          { axis: 'x', value: bounds.maxX, spanMin: bounds.minZ, spanMax: bounds.maxZ },
          { axis: 'z', value: bounds.minZ, spanMin: bounds.minX, spanMax: bounds.maxX },
          { axis: 'z', value: bounds.maxZ, spanMin: bounds.minX, spanMax: bounds.maxX },
        ];
        edges.forEach((edge) => {
          const neighbor = floorSurfaces.some((other) => {
            if (other === floor) return false;
            const a = floor.bounds;
            const b = other.bounds;
            const overlap = edge.axis === 'x'
              ? Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
              : Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
            const shared = edge.axis === 'x'
              ? Math.abs((edge.value === a.minX ? b.maxX : b.minX) - edge.value) < 0.01
              : Math.abs((edge.value === a.minZ ? b.maxZ : b.minZ) - edge.value) < 0.01;
            return shared && overlap > evidence.profile.wallThickness;
          });
          const wallAtEdge = wallSurfaces.some((wall) => {
            const center = wall.worldPosition;
            const coordinateMatch = edge.axis === 'x'
              ? Math.abs(center[0] - edge.value) < evidence.profile.wallThickness * 1.5
              : Math.abs(center[2] - edge.value) < evidence.profile.wallThickness * 1.5;
            const span = edge.axis === 'x' ? center[2] : center[0];
            return coordinateMatch && span >= edge.spanMin && span <= edge.spanMax;
          });
          if (neighbor) {
            expect(wallAtEdge, `${archetype} ${floor.topology.z}:${floor.topology.column} shared ${edge.axis}=${edge.value}`).toBe(false);
          }
        });
      });
      const floorByCoordinate = new Map(floorSurfaces.map((floor) => [
        `${floor.topology.x}:${floor.topology.y}`,
        floor,
      ]));
      const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      cells.forEach((cell) => {
        directions.forEach(([dx, dy], dir) => {
          const neighbor = cells.find(({ x, y }) => x === cell.x + dx && y === cell.y + dy);
          if (!neighbor || cell.y > neighbor.y || (cell.y === neighbor.y && cell.x > neighbor.x)) return;
          const currentFloor = floorByCoordinate.get(`${cell.x}:${cell.y}`);
          const neighborFloor = floorByCoordinate.get(`${neighbor.x}:${neighbor.y}`);
          if (!currentFloor || !neighborFloor) return;
          const currentBounds = currentFloor.bounds;
          const neighborBounds = neighborFloor.bounds;
          const sharedX = Math.abs(currentBounds.maxX - neighborBounds.minX) < 0.01
            ? currentBounds.maxX
            : Math.abs(currentBounds.minX - neighborBounds.maxX) < 0.01
              ? currentBounds.minX
              : null;
          const sharedZ = Math.abs(currentBounds.maxZ - neighborBounds.minZ) < 0.01
            ? currentBounds.maxZ
            : Math.abs(currentBounds.minZ - neighborBounds.maxZ) < 0.01
              ? currentBounds.minZ
              : null;
          const axis = sharedX !== null ? 'x' : sharedZ !== null ? 'z' : null;
          expect(axis, `${archetype} logical adjacent cells must share a world edge: ${cell.x}:${cell.y} -> ${neighbor.x}:${neighbor.y}`).not.toBeNull();
          const value = axis === 'x' ? sharedX : sharedZ;
          const spanMin = axis === 'x'
            ? Math.max(currentBounds.minZ, neighborBounds.minZ)
            : Math.max(currentBounds.minX, neighborBounds.minX);
          const spanMax = axis === 'x'
            ? Math.min(currentBounds.maxZ, neighborBounds.maxZ)
            : Math.min(currentBounds.maxX, neighborBounds.maxX);
          const wallAtEdge = wallSurfaces.some((wall) => {
            const center = wall.worldPosition;
            const coordinateMatch = axis === 'x'
              ? Math.abs(center[0] - value) < evidence.profile.wallThickness * 1.5
              : Math.abs(center[2] - value) < evidence.profile.wallThickness * 1.5;
            const span = axis === 'x' ? center[2] : center[0];
            return coordinateMatch && span >= spanMin && span <= spanMax;
          });
          expect(wallAtEdge, `${archetype} logical edge ${cell.x}:${cell.y} dir=${dir}`).toBe(
            evidence.map[cell.y][cell.x].walls[dir]
          );
        });
      });
      const currentFloor = floorSurfaces.find(({ topology }) => topology.z === 0 && topology.column === 0);
      floorSurfaces.filter(({ topology }) => topology.z === 0 && Math.abs(topology.column) === 1).forEach((branchFloor) => {
        expect(branchFloor.worldPosition[1]).toBe(currentFloor.worldPosition[1]);
        expect(Math.abs(branchFloor.worldPosition[0] - currentFloor.worldPosition[0])).toBeCloseTo(
          (evidence.profile.cellWidth + evidence.profile.cellDepth) / 2,
          5,
        );
        expect(branchFloor.worldPosition[2]).toBeCloseTo(currentFloor.worldPosition[2], 5);
      });

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

test('Issue 1199 spike releases scene-owned resources across same-instance rebuilds @smoke @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await installSpikeCanvas(page, { width: 390, height: 844 });
  const stats = await page.evaluate(async () => {
    const { createThreeDungeonSpikeRenderer } = await import('/src/three_dungeon_spike.js');
    const canvas = document.querySelector('#three-dungeon-spike-canvas');
    const map = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    })));
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], dir) => {
      map[1][1].walls[dir] = false;
      map[1 + dy][1 + dx].walls[(dir + 2) % 4] = false;
    });
    const renderer = createThreeDungeonSpikeRenderer(canvas);
    renderer.renderMap(map, 1, 1, 0);
    renderer.renderMap(map, 1, 1, 0);
    renderer.dispose();
    return renderer.getResourceStats();
  });
  expect(stats.rebuilds).toBe(2);
  expect(stats.createdGeometries).toBeGreaterThan(0);
  expect(stats.createdMaterials).toBeGreaterThan(0);
  expect(stats.disposedGeometries).toBe(stats.createdGeometries);
  expect(stats.disposedMaterials).toBe(stats.createdMaterials);
  expect(stats.unreleasedGeometries).toBe(0);
  expect(stats.unreleasedMaterials).toBe(0);
});

test('Issue 1199 production-backed B1F proof uses generated map and renderer-neutral topology @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await installSpikeCanvas(page, { width: 390, height: 844 });
  const evidence = await page.evaluate(async (fixtureConfig) => {
    const { generateRunFloor } = await import('/src/run_map_generator.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const { createThreeDungeonSpikeRenderer } = await import('/src/three_dungeon_spike.js');
    const generated = generateRunFloor({ runSeed: fixtureConfig.seed, floor: fixtureConfig.floor });
    const grid = generated.grid;
    const fixture = {
      ...fixtureConfig,
      topology: getVisibleCorridorTopology(grid, fixtureConfig.x, fixtureConfig.y, fixtureConfig.dir),
    };
    const current = fixture.topology.find((cell) => cell.z === 0 && cell.column === 0);
    const sideOpeningCount = fixture.topology.filter((cell) => cell.z === 0 && Math.abs(cell.column) === 1).length;
    const forwardDepth = fixture.topology.filter((cell) => cell.z > 0 && cell.column === 0).length;
    if (!current?.valid || current.frontBlocked || current.backBlocked || sideOpeningCount === 0 || forwardDepth === 0) {
      throw new Error('fixed deterministic B1F fixture no longer satisfies the representative near-side-opening contract');
    }
    const canvas = document.querySelector('#three-dungeon-spike-canvas');
    window.__threeDungeonSpike?.dispose();
    window.__threeDungeonSpike = createThreeDungeonSpikeRenderer(canvas);
    window.__threeDungeonSpike.renderMap(grid, fixture.x, fixture.y, fixture.dir, getFloorTheme(1).visualSignature);
    return {
      seed: fixture.seed,
      x: fixture.x,
      y: fixture.y,
      dir: fixture.dir,
      sideOpeningCount,
      forwardDepth,
      topology: fixture.topology.map(({ z, column, frontBlocked, leftBlocked, rightBlocked }) => ({ z, column, frontBlocked, leftBlocked, rightBlocked })),
      surfaces: window.__threeDungeonSpike.getTopologySurfaces(),
      camera: window.__threeDungeonSpike.getCameraContract(),
    };
  }, PRODUCTION_B1F_FIXTURE);
  expect(evidence.topology.some(({ z, column }) => z === 0 && Math.abs(column) === 1)).toBe(true);
  expect(evidence.topology.some(({ z, column }) => z > 0 && column === 0)).toBe(true);
  expect(evidence.sideOpeningCount).toBeGreaterThan(0);
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
