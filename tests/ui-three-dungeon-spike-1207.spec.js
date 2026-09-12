import { test, expect } from './fixtures/browser-health.js';

const REVIEW_VIEWPORTS = [
  { width: 390, height: 260 },
  { width: 320, height: 260 },
];
const TURN_CANDIDATES = ['square', 'shallow', 'medium', 'strong'];
const TURN_FIXTURES = ['straight-corridor', 'left-turn', 'right-turn'];
const BIOME_CANDIDATES = ['flat', 'arch'];
const PRODUCTION_FIXTURE = Object.freeze({
  seed: 'ISSUE-1199-B1F-PRODUCTION',
  floor: 1,
  x: 6,
  y: 4,
  dir: 1,
});

function installSpikeCanvas(page, viewport) {
  return page.evaluate(({ width, height }) => {
    const canvas = document.createElement('canvas');
    canvas.id = 'three-dungeon-spike-1207-canvas';
    canvas.setAttribute('aria-label', 'Issue 1207 fixed-camera structural candidate proof');
    canvas.style.display = 'block';
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.margin = '0 auto';
    document.body.replaceChildren(canvas);
  }, viewport);
}

function createSyntheticMap(archetype) {
  return {
    map: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    }))),
    paths: {
      'straight-corridor': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]],
      'left-turn': [[4, 4, 2], [4, 4, 3], [3, 4, 3], [2, 4, 3]],
      'right-turn': [[4, 4, 2], [4, 4, 1], [5, 4, 1], [6, 4, 1]],
    }[archetype],
  };
}

async function renderSynthetic(page, archetype, candidate) {
  return page.evaluate(async ({ candidate, fixture }) => {
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    fixture.paths.forEach(([x, y, dir]) => {
      const [dx, dy] = directions[dir];
      fixture.map[y][x].walls[dir] = false;
      fixture.map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
    });
    const { createThreeDungeonSpikeRenderer } = await import('/src/three_dungeon_spike.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const canvas = document.querySelector('#three-dungeon-spike-1207-canvas');
    window.__threeDungeonSpike1207?.dispose();
    window.__threeDungeonSpike1207 = createThreeDungeonSpikeRenderer(canvas, { candidate });
    window.__threeDungeonSpike1207.renderMap(fixture.map, 4, 4, 0);
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const pixelBuffer = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixelBuffer);
    let renderedPixelCount = 0;
    let pixelChecksum = 0;
    for (let index = 0; index < pixelBuffer.length; index += 4) {
      if (pixelBuffer[index] + pixelBuffer[index + 1] + pixelBuffer[index + 2] > 30) renderedPixelCount += 1;
      pixelChecksum = (pixelChecksum + pixelBuffer[index] * 3 + pixelBuffer[index + 1] * 5 + pixelBuffer[index + 2] * 7) % 1000000007;
    }
    return {
      camera: window.__threeDungeonSpike1207.getCameraContract(),
      geometry: window.__threeDungeonSpike1207.getGeometryContract(),
      profile: window.__threeDungeonSpike1207.profile,
      map: fixture.map,
      topology: getVisibleCorridorTopology(fixture.map, 4, 4, 0),
      surfaces: window.__threeDungeonSpike1207.getTopologySurfaces(),
      frames: window.__threeDungeonSpike1207.getTopologyFrames(),
      renderedPixelCount,
      pixelChecksum,
    };
  }, { candidate, fixture: createSyntheticMap(archetype) });
}

function assertTruthfulGeometry(evidence, expectedCandidate) {
  expect(evidence.geometry.candidate).toBe(expectedCandidate);
  expect(evidence.camera.position).toEqual([0, 1.8, 3]);
  expect(evidence.camera.target).toEqual([0, 0.3, -2.4]);
  expect(evidence.camera.fov).toBe(90);
  expect(evidence.camera.view[1]).toBe(260);
  expect(evidence.surfaces.some(({ surface }) => surface === 'floor')).toBe(true);
  expect(evidence.surfaces.some(({ surface }) => surface === 'ceiling')).toBe(true);
  expect(evidence.surfaces.some(({ surface }) => surface.includes('side-branch'))).toBe(false);
  expect(evidence.surfaces.some(({ surface }) => surface === 'ramp' || surface === 'marker')).toBe(false);

  const surfacesByCell = new Map();
  evidence.surfaces.forEach((surface) => {
    const key = `${surface.topology.z}:${surface.topology.column}`;
    surfacesByCell.set(key, [...(surfacesByCell.get(key) || []), surface.surface]);
  });
  const framesByCell = new Map(evidence.frames.map(({ topology, frame }) => [
    `${topology.z}:${topology.column}`,
    frame,
  ]));
  const floorSurfaces = evidence.surfaces.filter(({ surface }) => surface === 'floor');
  const ceilingSurfaces = evidence.surfaces.filter(({ surface }) => surface === 'ceiling');
  expect(floorSurfaces.every(({ worldPosition }) => worldPosition[1] === 0)).toBe(true);
  floorSurfaces.forEach((floor) => {
    const ceiling = ceilingSurfaces.find(({ topology }) =>
      topology.z === floor.topology.z && topology.column === floor.topology.column,
    );
    expect(ceiling.bounds.minX).toBeCloseTo(floor.bounds.minX, 5);
    expect(ceiling.bounds.maxX).toBeCloseTo(floor.bounds.maxX, 5);
    expect(ceiling.bounds.minZ).toBeCloseTo(floor.bounds.minZ, 5);
    expect(ceiling.bounds.maxZ).toBeCloseTo(floor.bounds.maxZ, 5);
  });
  evidence.topology.filter(({ valid }) => valid).forEach((cell) => {
    const surfaces = surfacesByCell.get(`${cell.z}:${cell.column}`) || [];
    const frame = framesByCell.get(`${cell.z}:${cell.column}`);
    expect(surfaces).toContain('floor');
    expect(surfaces).toContain('ceiling');
    ['frontBlocked', 'backBlocked', 'leftBlocked', 'rightBlocked'].forEach((edge) => {
      const wall = `${edge.replace('Blocked', '')}-wall`;
      expect(surfaces.includes(wall), `${cell.z}:${cell.column} ${edge}`).toBe(frame[edge]);
    });
  });
}

test('Issue 1207 turn candidates preserve fixed camera and truthful topology at 390px and 320px @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of REVIEW_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: 844 });
    await page.goto('/');
    await installSpikeCanvas(page, viewport);

    const checksumsByFixture = new Map();
    for (const candidate of TURN_CANDIDATES) {
      for (const archetype of TURN_FIXTURES) {
        const evidence = await renderSynthetic(page, archetype, candidate);
        assertTruthfulGeometry(evidence, candidate);
        expect(evidence.renderedPixelCount).toBeGreaterThan(100);
        const checksums = checksumsByFixture.get(archetype) || [];
        checksums.push(evidence.pixelChecksum);
        checksumsByFixture.set(archetype, checksums);
        const screenshot = await page.locator('#three-dungeon-spike-1207-canvas').screenshot({
          path: testInfo.outputPath(`issue-1207-turn-${candidate}-${archetype}-${viewport.width}px.png`),
        });
        await testInfo.attach(`issue-1207-turn-${candidate}-${archetype}-${viewport.width}px`, {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    }
    TURN_FIXTURES.forEach((archetype) => {
      expect(new Set(checksumsByFixture.get(archetype)).size, `${archetype} candidate pixels should differ`).toBeGreaterThan(1);
    });
  }
});

test('Issue 1207 flat and arch candidates share navigation grammar and differ structurally at 390px and 320px @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of REVIEW_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: 844 });
    await page.goto('/');
    await installSpikeCanvas(page, viewport);
    const evidenceByCandidate = {};

    const biomeChecksums = [];
    for (const candidate of BIOME_CANDIDATES) {
      for (const archetype of TURN_FIXTURES) {
        const evidence = await renderSynthetic(page, archetype, candidate);
        assertTruthfulGeometry(evidence, candidate);
        expect(evidence.geometry.ceilingStyle).toBe(candidate);
        expect(evidence.geometry.archRise).toBe(candidate === 'arch' ? 0.7 : 0);
        expect(evidence.renderedPixelCount).toBeGreaterThan(100);
        biomeChecksums.push(evidence.pixelChecksum);
        if (archetype === 'straight-corridor') {
          evidenceByCandidate[candidate] = {
            topology: evidence.topology,
            surfaces: evidence.surfaces,
            geometry: evidence.geometry,
          };
        }
        const screenshot = await page.locator('#three-dungeon-spike-1207-canvas').screenshot({
          path: testInfo.outputPath(`issue-1207-biome-${candidate}-${archetype}-${viewport.width}px.png`),
        });
        await testInfo.attach(`issue-1207-biome-${candidate}-${archetype}-${viewport.width}px`, {
          body: screenshot,
          contentType: 'image/png',
        });
      }
    }

    expect(evidenceByCandidate.flat.topology).toEqual(evidenceByCandidate.arch.topology);
    expect(evidenceByCandidate.flat.geometry.ceilingStyle).not.toBe(evidenceByCandidate.arch.geometry.ceilingStyle);
    expect(evidenceByCandidate.flat.geometry.archSpringLine).not.toBe(evidenceByCandidate.arch.geometry.archSpringLine);
    expect(evidenceByCandidate.flat.geometry.archRise).not.toBe(evidenceByCandidate.arch.geometry.archRise);
    expect(new Set(biomeChecksums).size).toBeGreaterThan(1);
  }
});

test('Issue 1207 selected medium structural candidate composes with the generated B1F near branch @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of REVIEW_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: 844 });
    await page.goto('/');
    await installSpikeCanvas(page, viewport);
    const evidence = await page.evaluate(async ({ fixtureConfig, candidate }) => {
      const { generateRunFloor } = await import('/src/run_map_generator.js');
      const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
      const { getFloorTheme } = await import('/src/data/floor_themes.js');
      const { createThreeDungeonSpikeRenderer } = await import('/src/three_dungeon_spike.js');
      const generated = generateRunFloor({ runSeed: fixtureConfig.seed, floor: fixtureConfig.floor });
      const topology = getVisibleCorridorTopology(generated.grid, fixtureConfig.x, fixtureConfig.y, fixtureConfig.dir);
      const sideOpeningCount = topology.filter((cell) => cell.z === 0 && Math.abs(cell.column) === 1).length;
      const forwardDepth = topology.filter((cell) => cell.z > 0 && cell.column === 0).length;
      if (sideOpeningCount === 0 || forwardDepth === 0) {
        throw new Error('production-backed fixture no longer contains a near side opening and forward depth');
      }
      const canvas = document.querySelector('#three-dungeon-spike-1207-canvas');
      window.__threeDungeonSpike1207?.dispose();
      window.__threeDungeonSpike1207 = createThreeDungeonSpikeRenderer(canvas, { candidate });
      window.__threeDungeonSpike1207.renderMap(generated.grid, fixtureConfig.x, fixtureConfig.y, fixtureConfig.dir, getFloorTheme(1).visualSignature);
      return {
        candidate,
        sideOpeningCount,
        forwardDepth,
        topology,
        surfaces: window.__threeDungeonSpike1207.getTopologySurfaces(),
        geometry: window.__threeDungeonSpike1207.getGeometryContract(),
      };
    }, { fixtureConfig: PRODUCTION_FIXTURE, candidate: 'medium' });
    expect(evidence.sideOpeningCount).toBeGreaterThan(0);
    expect(evidence.forwardDepth).toBeGreaterThan(0);
    expect(evidence.surfaces.some(({ surface }) => surface === 'floor')).toBe(true);
    expect(evidence.surfaces.some(({ surface }) => surface === 'left-wall' || surface === 'right-wall')).toBe(true);
    expect(evidence.geometry.cornerChamfer).toBe(0.2);
    const screenshot = await page.locator('#three-dungeon-spike-1207-canvas').screenshot({
      path: testInfo.outputPath(`issue-1207-production-b1f-medium-${viewport.width}px.png`),
    });
    await testInfo.attach(`issue-1207-production-b1f-medium-${viewport.width}px`, {
      body: screenshot,
      contentType: 'image/png',
    });
  }
});
