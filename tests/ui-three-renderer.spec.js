import { test, expect } from './fixtures/browser-health.js';
import { inflateSync } from 'node:zlib';

function decodePng(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  signature.forEach((value, index) => { if (bytes[index] !== value) throw new Error('unsupported PNG signature'); });
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error('unsupported PNG format');
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
  const pixels = new Uint8Array(height * stride);
  let rawOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[rawOffset++];
    const rowOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[previousOffset + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? pixels[previousOffset + x - bytesPerPixel] : 0;
      const value = raw[rawOffset++];
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2)
        : filter === 4 ? (() => {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        })() : 0;
      pixels[rowOffset + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, bytesPerPixel, pixels };
}

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const TOPOLOGY_ARCHETYPES = [
  'straight-corridor',
  'dead-end',
  'left-turn',
  'right-turn',
  't-junction',
  'cross-junction',
];

test('Three.js Dungeon View keeps the four shell regions and renders at mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

    const layout = await page.evaluate(async () => {
      const canvas = document.querySelector('#dungeon-canvas');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const townSurfaces = [];
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.surface) townSurfaces.push(child.userData.surface);
      });
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      return {
        viewport: rect('#viewport-panel'),
        canvas: rect('#dungeon-canvas'),
        regions: Array.from(document.querySelectorAll('[data-shell-region]')).map((element) => element.dataset.shellRegion),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
        canvasSize: [canvas.width, canvas.height],
        townSurfaces,
      };
    });

    expect(layout.webgl).toBe(true);
    expect(layout.canvasSize).toEqual([400, 260]);
    expect(layout.regions).toEqual(expect.arrayContaining([
      'minimal-hud', 'dungeon-view', 'current-event-strip', 'action-dock',
    ]));
    expect(layout.canvas.width).toBeGreaterThan(0);
    expect(layout.canvas.height).toBeGreaterThan(0);
    expect(layout.townSurfaces).not.toContain('front-wall-invalid');
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.viewport.left).toBeGreaterThanOrEqual(-1);
    expect(layout.viewport.right).toBeLessThanOrEqual(layout.clientWidth + 1);
    const invalidTopologyWalls = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      let count = 0;
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.surface === 'front-wall-invalid') count += 1;
      });
      return count;
    });
    expect(invalidTopologyWalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`three-renderer-${viewport.width}x${viewport.height}.png`) });
  }
});

test('Three.js Dungeon View makes six local topology archetypes readable at all supported mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
    await expect(page.locator('#dungeon-minimap-overlay')).toHaveCSS('display', 'none');
    await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });
    await expect(page.locator('#viewport-hud')).toHaveCSS('display', 'none');

    for (const archetype of TOPOLOGY_ARCHETYPES) {
      await page.evaluate(async (name) => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
          walls: [true, true, true, true],
          blockEnter: [false, false, false, false],
          type: 'empty',
        })));
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const open = (x, y, dir) => {
          const [dx, dy] = directions[dir];
          map[y][x].walls[dir] = false;
          map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
        };
        const paths = {
          'straight-corridor': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]],
          'dead-end': [[4, 4, 2]],
          'left-turn': [[4, 4, 2], [4, 4, 3], [3, 4, 3]],
          'right-turn': [[4, 4, 2], [4, 4, 1], [5, 4, 1]],
          't-junction': [[4, 4, 2], [4, 4, 3], [4, 4, 1]],
          'cross-junction': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 4, 1], [4, 4, 3], [5, 4, 1], [3, 4, 3]],
        };
        paths[name].forEach(([x, y, dir]) => open(x, y, dir));

        state.party = [createStartingKitCharacter('vanguard')];
        state.currentRun = createDefaultCurrentRun();
        state.floor = 1;
        state.x = 4;
        state.y = 4;
        state.dir = 0;
        state.maps[0] = map;
        state.visitedMaps[0] = map.map((row) => row.map(() => true));
        state.mapRevision = (state.mapRevision || 0) + 1;
        state.gameState = 'explore';
        state.transitioning = false;
        state.combatState = null;
        state.roamingMonsters = [];
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, archetype);
      await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });
      await expect(page.locator('#viewport-hud')).toHaveCSS('display', 'none');

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        const topology = dungeonRenderer.getSceneTopology();
        const current = topology.find(({ z, column }) => z === 0 && column === 0);
        const branchRotations = {};
        const branchFloors = [];
        const branchJambs = [];
        const syntheticBranchSurfaces = [];
        dungeonRenderer.root.traverse((child) => {
          const cell = child.userData?.topology;
          if (child.userData?.surface === 'floor' && cell?.z === 0 && Math.abs(cell.column) === 1) {
            branchRotations[cell.column] = Number(child.parent.rotation.y.toFixed(3));
            branchFloors.push({
              column: cell.column,
              material: child.material?.type ?? null,
              depthTest: child.material?.depthTest ?? null,
              depthWrite: child.material?.depthWrite ?? null,
            });
          }
          if (child.userData?.surface === 'side-branch-jamb') {
            branchJambs.push({
              material: child.material?.type ?? null,
              depthTest: child.material?.depthTest ?? null,
              depthWrite: child.material?.depthWrite ?? null,
            });
          } else if (child.userData?.surface?.startsWith('side-branch-')) {
            syntheticBranchSurfaces.push(child.userData.surface);
          }
        });
        return {
          current: {
            leftBlocked: current.leftBlocked,
            rightBlocked: current.rightBlocked,
            frontBlocked: current.frontBlocked,
          },
          visible: topology.map(({ z, column }) => `${z}:${column}`).sort(),
          branchRotations,
          branchFloors: branchFloors.sort((a, b) => a.column - b.column),
          branchJambs,
          syntheticBranchSurfaces,
          cameraHeading: {
            y: Number(dungeonRenderer.camera.rotation.y.toFixed(3)),
          },
          cameraPosition: dungeonRenderer.camera.position.toArray().map((value) => Number(value.toFixed(3))),
          cameraFov: dungeonRenderer.camera.fov,
        };
      });

      expect(evidence.current).toEqual(expect.objectContaining({
        leftBlocked: ['straight-corridor', 'dead-end', 'right-turn'].includes(archetype),
        rightBlocked: ['straight-corridor', 'dead-end', 'left-turn'].includes(archetype),
        frontBlocked: ['dead-end', 'left-turn', 'right-turn', 't-junction'].includes(archetype),
      }));
      if (archetype === 'straight-corridor') expect(evidence.visible).toContain('3:0');
      if (archetype === 'dead-end') expect(evidence.visible).toEqual(['0:0']);
      if (archetype === 'left-turn') expect(evidence.visible).toContain('0:-1');
      if (archetype === 'right-turn') expect(evidence.visible).toContain('0:1');
      if (archetype === 'left-turn') expect(evidence.branchRotations['-1']).toBeCloseTo(Math.PI / 2, 3);
      if (archetype === 'right-turn') expect(evidence.branchRotations['1']).toBeCloseTo(-Math.PI / 2, 3);
      const expectedBranchColumns = evidence.visible
        .filter((cell) => cell.startsWith('0:'))
        .map((cell) => Number(cell.slice(2)))
        .filter((column) => Math.abs(column) === 1)
        .sort((a, b) => a - b);
      expect(evidence.branchFloors.map(({ column }) => column)).toEqual(expectedBranchColumns);
      expect(evidence.branchFloors.every(({ material, depthTest, depthWrite }) =>
        material === 'MeshStandardMaterial' && depthTest && depthWrite
      )).toBe(true);
      expect(evidence.branchJambs).toHaveLength(0);
      expect(evidence.syntheticBranchSurfaces).toEqual([]);
      expect(evidence.cameraHeading.y).toBeCloseTo(0, 3);
      expect(evidence.cameraPosition).toEqual([0, 1.8, 3]);
      expect(evidence.cameraFov).toBe(90);
      if (archetype === 't-junction') {
        expect(evidence.visible).toEqual(expect.arrayContaining(['0:-1', '0:1']));
        expect(evidence.visible).not.toContain('1:0');
      }
      if (archetype === 'cross-junction') expect(evidence.visible).toContain('2:0');

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`three-topology-${archetype}-${viewport.width}px.png`),
      });
      await testInfo.attach(`three-topology-${archetype}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }
});

test('Three.js corridor readability keeps the frozen profile and real openings clear @smoke @visual', async ({ page }, testInfo) => {
  const fixtures = [
    {
      name: 'b1-straight',
      floor: 1,
      widths: VIEWPORTS,
      path: [[5, 5, 0], [5, 4, 0], [5, 3, 0], [5, 2, 0]],
    },
    {
      name: 'b1-left-turn-frozen',
      floor: 1,
      widths: [VIEWPORTS[0], VIEWPORTS[2]],
      path: [[5, 5, 0], [5, 4, 3], [4, 4, 3], [3, 4, 3]],
    },
    {
      name: 'b1-right-turn-frozen',
      floor: 1,
      widths: [VIEWPORTS[0], VIEWPORTS[2]],
      path: [[5, 5, 0], [5, 4, 1], [6, 4, 1], [7, 4, 1]],
    },
    {
      name: 'b2-straight-frozen',
      floor: 6,
      widths: [VIEWPORTS[2]],
      path: [[5, 5, 0], [5, 4, 0], [5, 3, 0], [5, 2, 0]],
    },
    {
      name: 'b2-right-turn-frozen',
      floor: 6,
      widths: [VIEWPORTS[0], VIEWPORTS[2]],
      path: [[5, 5, 0], [5, 4, 1], [6, 4, 1], [7, 4, 1]],
    },
    {
      name: 'b2-left-turn-frozen',
      floor: 6,
      widths: [VIEWPORTS[0], VIEWPORTS[2]],
      path: [[5, 5, 0], [5, 4, 3], [4, 4, 3], [3, 4, 3]],
    },
  ];

  for (const fixture of fixtures) {
    for (const viewport of fixture.widths) {
      await page.setViewportSize(viewport);
      await page.goto('/?renderer=three');
      await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
      await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
      await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });
      await expect(page.locator('#viewport-hud')).toHaveCSS('display', 'none');

      await page.evaluate(async ({ floor, path }) => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        const makeCell = () => ({
          walls: [true, true, true, true],
          blockEnter: [false, false, false, false],
          type: 'empty',
        });
        const map = Array.from({ length: 11 }, () => Array.from({ length: 11 }, makeCell));
        for (const [x, y, direction] of path) {
          const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][direction];
          map[y][x].walls[direction] = false;
          map[y + dy][x + dx].walls[(direction + 2) % 4] = false;
        }
        state.party = [createStartingKitCharacter('vanguard')];
        state.currentRun = createDefaultCurrentRun();
        state.floor = floor;
        state.x = 5;
        state.y = 5;
        state.dir = 0;
        state.maps[floor - 1] = map;
        state.visitedMaps[floor - 1] = map.map((row) => row.map(() => true));
        state.map = map;
        state.mapRevision = (state.mapRevision || 0) + 1;
        state.gameState = 'explore';
        state.transitioning = false;
        state.combatState = null;
        state.roamingMonsters = [];
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, { floor: fixture.floor, path: fixture.path });
      await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });
      await expect(page.locator('#viewport-hud')).toHaveCSS('display', 'none');

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        const metrics = (await import('/src/three_renderer.js')).getThreeCorridorReadabilityMetrics(
          dungeonRenderer.getRenderInput().visual.geometry
        );
        let ceiling = null;
        const farBranchSurfaces = [];
        const farBranchDepth = [];
        const wallGeometryVertexCounts = [];
        dungeonRenderer.root.traverse((child) => {
          if (child.userData?.surface === 'ceiling' && !ceiling) ceiling = child;
          if (child.userData?.surface?.endsWith('wall')) {
            wallGeometryVertexCounts.push({
              surface: child.userData.surface,
              count: child.geometry?.attributes?.position?.count ?? 0,
            });
          }
          if (child.userData?.surface?.startsWith('side-branch-')) {
            farBranchSurfaces.push(child.userData.surface);
            farBranchDepth.push({
              surface: child.userData.surface,
              depthTest: child.material?.depthTest,
              depthWrite: child.material?.depthWrite,
            });
          }
        });
        const ceilingPositionY = ceiling?.position.y ?? null;
        const ceilingMaxY = ceiling?.geometry?.attributes?.position
          ? Math.max(...Array.from({ length: ceiling.geometry.attributes.position.count }, (_, index) =>
            ceiling.geometry.attributes.position.getY(index)
          )) + ceilingPositionY
          : null;
        return {
          metrics,
          cameraFov: dungeonRenderer.camera.fov,
          fog: { near: dungeonRenderer.scene.fog.near, far: dungeonRenderer.scene.fog.far },
          ceilingStyle: dungeonRenderer.activeProfile.ceilingStyle,
          wallHeight: dungeonRenderer.activeProfile.wallHeight,
          cornerChamfer: dungeonRenderer.activeProfile.cornerChamfer,
          archSpringLine: dungeonRenderer.activeProfile.archSpringLine,
          archRise: dungeonRenderer.activeProfile.archRise,
          ceilingPositionY,
          ceilingMaxY,
          ceilingMinY: ceiling?.geometry?.attributes?.position
            ? Math.min(...Array.from({ length: ceiling.geometry.attributes.position.count }, (_, index) =>
              ceiling.geometry.attributes.position.getY(index)
            )) + ceilingPositionY
            : null,
          wallGeometryVertexCounts,
          farBranchSurfaces,
          farBranchDepth,
        };
      });

      expect(evidence.cameraFov).toBe(90);
      expect(evidence.metrics.forwardOpeningWidth[0]).toBeGreaterThan(20);
      expect(evidence.metrics.forwardOpeningWidth[0]).toBeGreaterThan(evidence.metrics.forwardOpeningWidth[1]);
      expect(evidence.metrics.forwardOpeningWidth[1]).toBeGreaterThan(evidence.metrics.forwardOpeningWidth[2]);
      expect(evidence.metrics.currentCellSideWallOccupancy).toBeGreaterThan(0.8);
      expect(evidence.fog.near).toBeLessThan(evidence.metrics.cellFrontDistances[0]);
      expect(evidence.fog.far).toBeGreaterThan(evidence.metrics.cellFrontDistances[2]);
      const expectedCeilingStyle = fixture.floor === 6 ? 'arch' : 'flat';
      expect(evidence.ceilingStyle).toBe(expectedCeilingStyle);
      expect(evidence.cornerChamfer).toBe(0.1);
      if (expectedCeilingStyle === 'flat') {
        expect(evidence.archSpringLine).toBe(2.4);
        expect(evidence.archRise).toBe(0);
        expect(evidence.ceilingPositionY).toBeCloseTo(evidence.wallHeight, 5);
        expect(evidence.ceilingMaxY).toBeGreaterThan(evidence.wallHeight - 0.01);
      } else {
        expect(evidence.archSpringLine).toBe(1.7);
        expect(evidence.archRise).toBe(0.7);
        expect(evidence.ceilingPositionY).toBeCloseTo(0, 5);
        expect(evidence.ceilingMinY).toBeCloseTo(1.7, 5);
        expect(evidence.ceilingMaxY).toBeCloseTo(2.4, 5);
      }
      expect(evidence.wallGeometryVertexCounts.length).toBeGreaterThan(0);
      expect(evidence.wallGeometryVertexCounts.every(({ count }) => count === 16)).toBe(true);
      expect(evidence.farBranchSurfaces).toEqual([]);
      expect(evidence.farBranchDepth).toEqual([]);

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`three-readability-${fixture.name}-${viewport.width}px.png`),
      });
      await testInfo.attach(`three-readability-${fixture.name}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }
});

test('Three.js production B1F state keeps a real side passage continuous with the floor @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
    await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });

    const evidence = await page.evaluate(async () => {
    const { generateRunFloor } = await import('/src/run_map_generator.js');
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { getThreeProjectedBounds } = await import('/src/three_renderer.js');
    const generated = generateRunFloor({ runSeed: 'issue-1181-production-1', floor: 1 });
    const map = generated.grid;
    const x = 7;
    const y = 13;
    const currentCell = map[y][x];
    const branchCell = map[y][x + 1];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = { ...createDefaultCurrentRun(), runSeed: 'issue-1181-production-1' };
    state.floor = 1;
    state.x = x;
    state.y = y;
    state.dir = 0;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row) => row.map(() => true));
    state.map = map;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.roamingMonsters = [];
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
    const topology = dungeonRenderer.getSceneTopology();
    const branchFloors = [];
    const branchJambs = [];
    const syntheticSurfaces = [];
    dungeonRenderer.root.traverse((child) => {
      const cell = child.userData?.topology;
      if (child.userData?.surface === 'floor' && cell?.z === 0 && cell?.column === 1) {
        branchFloors.push({
          x: cell.x,
          y: cell.y,
          yPosition: child.position.y,
          material: child.material?.type ?? null,
          depthTest: child.material?.depthTest ?? null,
          depthWrite: child.material?.depthWrite ?? null,
          bounds: getThreeProjectedBounds(child, dungeonRenderer.camera),
        });
      }
      if (child.userData?.surface === 'side-branch-jamb') {
        const jambTopology = child.userData?.topology;
        branchJambs.push({
          z: jambTopology?.z ?? null,
          column: jambTopology?.column ?? null,
          material: child.material?.type ?? null,
          depthTest: child.material?.depthTest ?? null,
          depthWrite: child.material?.depthWrite ?? null,
        });
      } else if (child.userData?.surface?.startsWith('side-branch-')) {
        syntheticSurfaces.push(child.userData.surface);
      }
    });
    return {
      generatedValid: generated.validation.valid,
      generatedSeed: generated.generationSeed,
      currentCell: {
        x,
        y,
        openNorth: currentCell.walls[0] === false,
        openEast: currentCell.walls[1] === false,
        openWest: currentCell.walls[3] === false,
      },
      branchCell: {
        openNorth: branchCell.walls[0] === false,
        openEast: branchCell.walls[1] === false,
      },
      branchTopology: topology.find(({ z, column }) => z === 0 && column === 1),
      branchFloors,
      branchJambs,
      syntheticSurfaces,
    };
    });

    expect(evidence.generatedValid).toBe(true);
    expect(evidence.currentCell).toEqual({ x: 7, y: 13, openNorth: true, openEast: true, openWest: false });
    expect(evidence.branchCell).toEqual({ openNorth: true, openEast: true });
    expect(evidence.branchTopology).toEqual(expect.objectContaining({ z: 0, column: 1, x: 8, y: 13, valid: true }));
    expect(evidence.branchFloors).toEqual([
      {
        x: 8,
        y: 13,
        yPosition: 0,
        material: 'MeshStandardMaterial',
        depthTest: true,
        depthWrite: true,
        bounds: expect.objectContaining({
          visibleWidth: expect.any(Number),
          visibleHeight: expect.any(Number),
        }),
      },
    ]);
    expect(evidence.branchJambs).toEqual([]);
    console.log(`[issue-1181] production B1F branch evidence ${viewport.width}px ${JSON.stringify(evidence)}`);
    expect(evidence.branchFloors[0].bounds.visibleWidth).toBeGreaterThan(20);
    expect(evidence.branchFloors[0].bounds.visibleHeight).toBeGreaterThan(10);
    expect(evidence.syntheticSurfaces).toEqual([]);
    await page.locator('#viewport-hud').evaluate((element) => { element.style.display = 'none'; });

    const screenshot = await page.locator('#dungeon-canvas').screenshot({
      path: testInfo.outputPath(`three-production-b1-right-branch-${viewport.width}px.png`),
    });
    await testInfo.attach(`three-production-b1-right-branch-${viewport.width}px`, {
      body: screenshot,
      contentType: 'image/png',
    });
  }
});

test('Three.js danger cue stays outside the camera and visible in the corridor @smoke @e2e @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
  await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });

  const evidence = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const makeCell = () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    });
    const map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, makeCell));
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 3;
    state.y = 3;
    state.dir = 0;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row) => row.map(() => true));
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.roamingMonsters = [{ floor: 1, x: 3, y: 2, kind: 'elite', perception: 'visible' }];
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
    let cue = null;
    dungeonRenderer.root.traverse((child) => {
      if (child.userData?.surface === 'danger-cue') cue = child;
    });
    return {
      cameraPosition: dungeonRenderer.camera.position.toArray().map((value) => Number(value.toFixed(3))),
      cuePosition: cue?.position.toArray().map((value) => Number(value.toFixed(3))) ?? null,
      cueRadius: cue?.geometry.parameters.radius ?? null,
      cameraToCue: cue ? dungeonRenderer.camera.position.distanceTo(cue.position) : null,
    };
  });

  expect(evidence.cuePosition).not.toBeNull();
  expect(evidence.cueRadius).toBeLessThan(0.3);
  expect(evidence.cameraToCue).toBeGreaterThan(evidence.cueRadius);
  const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('three-danger-cue-390px.png') });
  await testInfo.attach('three-danger-cue-390px', { body: screenshot, contentType: 'image/png' });
});

test('Canvas and Three.js share the same exploration mini-map overlay contract @smoke @e2e @visual', async ({ page }, testInfo) => {
  const measure = async (url) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', url.includes('renderer=three') ? 'three' : 'canvas');
    return page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const makeCell = () => ({
        walls: [false, false, false, false],
        blockEnter: [false, false, false, false],
        type: 'empty',
        event: null,
      });
      const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
      state.party = [createStartingKitCharacter('vanguard')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 1;
      state.x = 4;
      state.y = 4;
      state.dir = 1;
      state.maps[0] = map;
      state.visitedMaps[0] = map.map((row) => row.map(() => true));
      state.mapRevision = (state.mapRevision || 0) + 1;
      state.roamingMonsters = [];
      state.lightTurns = 0;
      state.lightPower = '';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: '検証敵', level: 1, hp: 10, maxHp: 10, color: '#ff3b30' }],
      };
      state.chestState = null;
      state.transitioning = false;
      const overlay = document.querySelector('#dungeon-minimap-overlay');
      const checksum = () => Array.from(overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data)
        .reduce((sum, value) => sum + value, 0);
      const draw = () => {
        dungeonRenderer.draw();
        return {
          visible: overlay.dataset.minimapVisible === 'true',
          checksum: checksum(),
        };
      };

      state.gameState = 'explore';
      menuContext.type = '';
      menuContext.prevGameState = null;
      const explore = draw();

      state.gameState = 'combat';
      const combat = draw();

      state.gameState = 'chest';
      state.chestState = { trap: 'none' };
      const chest = draw();

      state.gameState = 'trap_encounter';
      state.chestState = null;
      const event = draw();

      state.gameState = 'submenu';
      menuContext.type = 'item_inventory';
      const item = draw();

      return {
        explore,
        hidden: [combat, chest, event, item],
        pointerEvents: getComputedStyle(overlay).pointerEvents,
      };
    });
  };

  const restoreExploreState = async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    state.gameState = 'explore';
    menuContext.type = '';
    menuContext.prevGameState = null;
    updateUI();
    dungeonRenderer.draw();
  });

  const canvas = await measure('/');
  await restoreExploreState();
  const canvasScreenshot = await page.locator('#viewport-panel').screenshot({
    path: testInfo.outputPath('canvas-minimap-visible-branch-390px.png'),
  });
  await testInfo.attach('canvas-minimap-visible-branch-390px', {
    body: canvasScreenshot,
    contentType: 'image/png',
  });

  const three = await measure('/?renderer=three');
  await restoreExploreState();
  const minimapScreenshot = await page.locator('#viewport-panel').screenshot({
    path: testInfo.outputPath('three-minimap-visible-branch-390px.png'),
  });
  await testInfo.attach('three-minimap-visible-branch-390px', {
    body: minimapScreenshot,
    contentType: 'image/png',
  });
  expect(canvas.explore.visible).toBe(true);
  expect(three.explore.visible).toBe(true);
  expect(canvas.explore.checksum).toBeGreaterThan(0);
  expect(three.explore.checksum).toBe(canvas.explore.checksum);
  expect(canvas.hidden.every(({ visible, checksum }) => !visible && checksum === 0)).toBe(true);
  expect(three.hidden.every(({ visible, checksum }) => !visible && checksum === 0)).toBe(true);
  expect(canvas.pointerEvents).toBe('none');
  expect(three.pointerEvents).toBe('none');
});

test('Three.js Dungeon View survives orientation resize without overflow @smoke @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  await page.setViewportSize({ width: 844, height: 390 });
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('#dungeon-canvas');
    return {
      canvasSize: [canvas.width, canvas.height],
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      viewport: document.querySelector('#viewport-panel').getBoundingClientRect().toJSON(),
    };
  });
  expect(layout.canvasSize).toEqual([400, 260]);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.viewport.right).toBeLessThanOrEqual(layout.clientWidth + 1);
});

test('Three.js Dungeon View directly selects an enemy and retains an accessible fallback @smoke @e2e', async ({ page }) => {
  await page.goto('/?renderer=three');
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');

  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const { openCombatTargetMenu } = await import('/src/combat_ui/target_menu.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 0;
    state.y = 0;
    state.dir = 0;
    state.gameState = 'combat';
    state.transitioning = false;
    state.maps[state.floor - 1] = [[{ walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty' }]];
    state.visitedMaps[state.floor - 1] = [[true]];
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '強敵の検証体', level: 5, hp: 20, maxHp: 20, color: '#d45de6', spriteType: 'golem' },
        { name: '遠方の検証体', level: 1, hp: 12, maxHp: 12, color: '#58d6e8', spriteType: 'wisp' },
      ],
    };
    menuContext.actorIdx = 0;
    window.__threeTarget = null;
    openCombatTargetMenu('enemy', (targetIdx) => {
      window.__threeTarget = targetIdx;
      updateUI();
    });
    updateUI();
  });

  await expect(page.locator('.combat-target-selection-message')).toHaveText('敵をタップして対象を選択');
  await expect(page.locator('.combat-target-a11y-list')).toHaveCount(1);
  await expect(page.locator('.combat-target-a11y')).toHaveCount(2);
  await expect(page.locator('.combat-target-a11y-list')).toHaveCSS('position', 'absolute');

  const combatDepth = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const surfaces = [];
    let targetZ = null;
    let monsterZ = null;
    dungeonRenderer.root.traverse((child) => {
      if (child.userData?.surface === 'front-wall' && child.userData.topology?.z === 0 && child.userData.topology?.column === 0) {
        surfaces.push({ surface: child.userData.surface, z: child.position.z });
      }
      if (child.userData?.targetIdx === 0) targetZ = child.position.z;
      if (child.userData?.sceneLayer === 'combat' && child.userData?.monsterIndex === 0) monsterZ = child.position.z;
    });
    return { frontWallZ: surfaces[0]?.z ?? null, targetZ, monsterZ };
  });
  expect(combatDepth.frontWallZ).toBeCloseTo(-1.6, 5);
  expect(combatDepth.monsterZ).toBeGreaterThan(combatDepth.frontWallZ);
  expect(combatDepth.targetZ).toBeGreaterThan(combatDepth.frontWallZ);

  await page.locator('#dungeon-canvas').click({ position: { x: 180, y: 150 } });
  await expect.poll(() => page.evaluate(() => window.__threeTarget)).toBe(0);
  await expect(page.locator('#combat-overlay')).toBeHidden();
});

test('Three.js combat staging keeps enemy bodies and labels readable across portrait widths @smoke @visual', async ({ page }, testInfo) => {
  const fixtures = [
    {
      name: 'single',
      monsters: [{ name: '単体の検証敵', level: 4, hp: 24, maxHp: 24, color: '#d45de6', spriteType: 'golem' }],
    },
    {
      name: 'multi',
      monsters: [
        { name: '左の検証敵', level: 4, hp: 24, maxHp: 24, color: '#54c8c3', spriteType: 'golem' },
        { name: '右の検証敵', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
      ],
    },
    {
      name: 'trio',
      monsters: [
        { name: '左の三体目', level: 4, hp: 24, maxHp: 24, color: '#54c8c3', spriteType: 'golem' },
        { name: '中央の三体目', level: 3, hp: 20, maxHp: 20, color: '#f0a04b', spriteType: 'wisp' },
        { name: '右の三体目', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
      ],
    },
  ];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

    for (const fixture of fixtures) {
      await page.evaluate(async (monsters) => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        const map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({
          walls: [true, true, true, true],
          blockEnter: [false, false, false, false],
          type: 'empty',
        })));
        state.party = [createStartingKitCharacter('vanguard')];
        state.currentRun = createDefaultCurrentRun();
        state.floor = 1;
        state.x = 3;
        state.y = 3;
        state.dir = 0;
        state.maps[0] = map;
        state.visitedMaps[0] = map.map((row) => row.map(() => true));
        state.mapRevision = (state.mapRevision || 0) + 1;
        state.gameState = 'combat';
        state.transitioning = false;
        state.combatState = { phase: 'choose_actions', monsters };
        state.chestState = null;
        state.roamingMonsters = [];
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, fixture.monsters);

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.camera.updateMatrixWorld();
        const project = (x, y, z) => {
          const point = dungeonRenderer.camera.position.clone().set(x, y, z).project(dungeonRenderer.camera);
          return { x: (point.x + 1) * 200, y: (1 - point.y) * 130 };
        };
        const bounds = (points) => ({
          left: Math.min(...points.map(({ x }) => x)),
          right: Math.max(...points.map(({ x }) => x)),
          top: Math.min(...points.map(({ y }) => y)),
          bottom: Math.max(...points.map(({ y }) => y)),
        });
        const combatGroups = [];
        const targetMeshes = [];
        dungeonRenderer.root.traverse((child) => {
          if (child.userData?.sceneLayer === 'combat') combatGroups.push(child);
          if (child.userData?.sceneLayer === 'combat-target') targetMeshes.push(child);
        });
        const groupEvidence = combatGroups.map((group) => {
          const body = group.children.find((child) => child.userData?.surface === 'combat-body');
          const label = group.children.find((child) => child.userData?.surface === 'combat-label');
          const marker = group.children.find((child) => child.userData?.surface === 'combat-marker');
          const radius = body.geometry.parameters.radius;
          const bodyBounds = bounds([-1, 1].flatMap((xSign) => [-1, 1].flatMap((ySign) => [-1, 1].map((zSign) => (
            project(
              group.position.x + xSign * radius,
              group.position.y + body.position.y + ySign * radius,
              group.position.z + zSign * radius,
            )
          )))));
          const labelWidth = label.geometry.parameters.width / 2;
          const labelHeight = label.geometry.parameters.height / 2;
          const labelBounds = bounds([-1, 1].flatMap((xSign) => [-1, 1].map((ySign) => (
            project(
              group.position.x + xSign * labelWidth,
              group.position.y + label.position.y + ySign * labelHeight,
              group.position.z,
            )
          ))));
          return {
            index: group.userData.monsterIndex,
            x: group.position.x,
            z: group.position.z,
            spacing: group.userData.staging.spacing,
            bodyRadius: radius,
            labelWidth: label.geometry.parameters.width,
            markerDiameter: (marker.geometry.parameters.radius + marker.geometry.parameters.tube) * 2,
            bodyBounds,
            labelBounds,
            marker: (() => {
              const marker = group.children.find((child) => child.userData?.surface === 'combat-marker');
              return marker ? [group.position.x + marker.position.x, marker.position.y, group.position.z + marker.position.z] : null;
            })(),
          };
        });
        const canvasRect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
        const hudRect = document.querySelector('#viewport-hud').getBoundingClientRect();
        const scale = Math.min(canvasRect.width / 400, canvasRect.height / 260);
        const renderedLeft = canvasRect.left + (canvasRect.width - 400 * scale) / 2;
        const renderedTop = canvasRect.top + (canvasRect.height - 260 * scale) / 2;
        const toLocal = (value, origin) => (value - origin) / scale;
        const hudBounds = {
          left: toLocal(hudRect.left, renderedLeft),
          right: toLocal(hudRect.right, renderedLeft),
          top: toLocal(hudRect.top, renderedTop),
          bottom: toLocal(hudRect.bottom, renderedTop),
        };
        return {
          groupEvidence,
          hudBounds,
          renderSurface: {
            scale,
            left: (canvasRect.width - 400 * scale) / 2,
            top: (canvasRect.height - 260 * scale) / 2,
          },
          targetMeshes: targetMeshes.map((mesh) => ({
            targetIdx: mesh.userData.targetIdx,
            radius: mesh.geometry.parameters.radius,
            position: mesh.position.toArray(),
          })),
          frontWallZ: 0.1,
        };
      });

      expect(evidence.groupEvidence).toHaveLength(fixture.monsters.length);
      for (const group of evidence.groupEvidence) {
        const overlapsHud = group.labelBounds.left < evidence.hudBounds.right
          && group.labelBounds.right > evidence.hudBounds.left
          && group.labelBounds.top < evidence.hudBounds.bottom
          && group.labelBounds.bottom > evidence.hudBounds.top;
        expect(overlapsHud, `label ${group.index} should not overlap direction HUD`).toBe(false);
      }
      for (const group of evidence.groupEvidence) {
        expect(group.z).toBeGreaterThan(evidence.frontWallZ);
        expect(group.bodyRadius).toBeLessThan(0.32);
        for (const bound of [group.bodyBounds, group.labelBounds]) {
          expect(bound.left).toBeGreaterThanOrEqual(0);
          expect(bound.right).toBeLessThanOrEqual(400);
          expect(bound.top).toBeGreaterThanOrEqual(0);
          expect(bound.bottom).toBeLessThanOrEqual(260);
        }
        expect(group.marker[0]).toBeCloseTo(group.x, 5);
        expect(group.marker[2]).toBeCloseTo(group.z, 5);
      }
      if (fixture.name === 'multi') {
        expect(Math.abs(evidence.groupEvidence[1].x - evidence.groupEvidence[0].x)).toBeGreaterThan(0.8);
      }
      if (fixture.name !== 'single') {
        const labelsByScreenRow = [...evidence.groupEvidence].sort((a, b) => a.labelBounds.top - b.labelBounds.top);
        for (let index = 1; index < labelsByScreenRow.length; index += 1) {
          expect(labelsByScreenRow[index - 1].labelBounds.bottom).toBeLessThan(labelsByScreenRow[index].labelBounds.top);
        }
      }
      if (fixture.name === 'trio') {
        for (let index = 1; index < evidence.groupEvidence.length; index += 1) {
          const previous = evidence.groupEvidence[index - 1];
          const current = evidence.groupEvidence[index];
          expect(current.x - previous.x).toBeGreaterThan(previous.bodyRadius + current.bodyRadius);
        }
        for (const group of evidence.groupEvidence) {
          expect(group.markerDiameter).toBeLessThan(group.spacing);
          expect(group.labelBounds.bottom).toBeLessThanOrEqual(group.bodyBounds.top);
        }
      }

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`three-combat-${fixture.name}-${viewport.width}px.png`),
      });
      const decoded = decodePng(screenshot);
      const labelPixelEvidence = evidence.groupEvidence.map(({ index, labelBounds }) => {
        let brightTextPixels = 0;
        const left = Math.max(0, Math.ceil(evidence.renderSurface.left + labelBounds.left * evidence.renderSurface.scale) + 5);
        const right = Math.min(decoded.width, Math.floor(evidence.renderSurface.left + labelBounds.right * evidence.renderSurface.scale) - 5);
        const top = Math.max(0, Math.ceil(evidence.renderSurface.top + labelBounds.top * evidence.renderSurface.scale) + 3);
        const bottom = Math.min(decoded.height, Math.floor(evidence.renderSurface.top + labelBounds.bottom * evidence.renderSurface.scale) - 3);
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const offset = (y * decoded.width + x) * decoded.bytesPerPixel;
            const red = decoded.pixels[offset];
            const green = decoded.pixels[offset + 1];
            const blue = decoded.pixels[offset + 2];
            if (red > 150 && green > 145 && blue > 130 && Math.max(red, green, blue) - Math.min(red, green, blue) < 90) {
              brightTextPixels += 1;
            }
          }
        }
        return { index, brightTextPixels };
      });
      expect(labelPixelEvidence).toHaveLength(fixture.monsters.length);
      for (const { index, brightTextPixels } of labelPixelEvidence) {
        expect(brightTextPixels, `enemy label ${index} needs visible text pixels in the rendered canvas`).toBeGreaterThanOrEqual(12);
      }
      await testInfo.attach(`three-combat-${fixture.name}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }
});

test('Three.js target selection keeps enlarged hit regions aligned with staged enemies @smoke @visual @e2e', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
    await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      const { openCombatTargetMenu } = await import('/src/combat_ui/target_menu.js');
      const map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({
        walls: [true, true, true, true],
        blockEnter: [false, false, false, false],
        type: 'empty',
      })));
      state.party = [createStartingKitCharacter('vanguard')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 1;
      state.x = 3;
      state.y = 3;
      state.dir = 0;
      state.maps[0] = map;
      state.visitedMaps[0] = map.map((row) => row.map(() => true));
      state.mapRevision = (state.mapRevision || 0) + 1;
      state.gameState = 'combat';
      state.transitioning = false;
      state.combatState = {
        phase: 'choose_actions',
        monsters: [
          { name: '左の対象', level: 4, hp: 24, maxHp: 24, color: '#54c8c3', spriteType: 'golem' },
          { name: '中央の対象', level: 3, hp: 20, maxHp: 20, color: '#f0a04b', spriteType: 'wisp' },
          { name: '右の対象', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
        ],
      };
      menuContext.actorIdx = 0;
      openCombatTargetMenu('enemy', () => {});
      updateUI();
      const { dungeonRenderer } = await import('/src/renderer.js');
      dungeonRenderer.draw();
    });

    const evidence = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      const groups = [];
      const targets = [];
      const rings = [];
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.sceneLayer === 'combat') groups.push(child);
        if (child.userData?.targetIdx !== undefined && child.geometry?.parameters?.radius !== undefined) targets.push(child);
        if (child.userData?.surface === 'combat-target-ring') rings.push(child);
      });
      return {
        groups: groups.map((group) => group.position.toArray()),
        spacing: groups[0]?.userData.staging.spacing ?? null,
        targets: targets.map((target) => ({ idx: target.userData.targetIdx, radius: target.geometry.parameters.radius, position: target.position.toArray() })),
        rings: rings.map((ring) => ({ idx: ring.userData.targetIdx, outerRadius: ring.geometry.parameters.outerRadius, position: ring.position.toArray() })),
      };
    });

    expect(evidence.groups).toHaveLength(3);
    expect(evidence.targets).toHaveLength(3);
    expect(evidence.rings).toHaveLength(3);
    expect(evidence.targets.every(({ radius }) => radius > 0.5)).toBe(true);
    for (const target of evidence.targets) {
      const group = evidence.groups[target.idx];
      expect(target.position[0]).toBeCloseTo(group[0], 5);
      expect(target.position[2]).toBeCloseTo(group[2], 5);
    }
    for (const ring of evidence.rings) {
      expect(ring.position[0]).toBeCloseTo(evidence.groups[ring.idx][0], 5);
      expect(ring.position[2]).toBeCloseTo(evidence.groups[ring.idx][2], 5);
      expect(ring.outerRadius * 2).toBeLessThan(evidence.spacing);
    }

    const targetByBodyCenter = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      const canvas = document.querySelector('#dungeon-canvas');
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / 400, rect.height / 260);
      const renderedWidth = 400 * scale;
      const renderedHeight = 260 * scale;
      dungeonRenderer.camera.updateMatrixWorld();
      const groups = [];
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.sceneLayer === 'combat') groups.push(child);
      });
      return groups.map((group) => {
        const body = group.children.find((child) => child.userData?.surface === 'combat-body');
        const center = group.position.clone().add(body.position).project(dungeonRenderer.camera);
        const clientX = rect.left + (rect.width - renderedWidth) / 2 + ((center.x + 1) / 2) * renderedWidth;
        const clientY = rect.top + (rect.height - renderedHeight) / 2 + ((1 - center.y) / 2) * renderedHeight;
        return {
          expected: group.userData.monsterIndex,
          actual: dungeonRenderer.getCombatTargetAtClientPoint(clientX, clientY),
        };
      });
    });
    expect(targetByBodyCenter).toEqual([
      { expected: 0, actual: 0 },
      { expected: 1, actual: 1 },
      { expected: 2, actual: 2 },
    ]);

    const screenshot = await page.locator('#dungeon-canvas').screenshot({
      path: testInfo.outputPath(`three-combat-target-selection-${viewport.width}px.png`),
    });
    await testInfo.attach(`three-combat-target-selection-${viewport.width}px`, {
      body: screenshot,
      contentType: 'image/png',
    });
  }
});

test('Three.js Dungeon View disposes geometry, material, and texture resources across repeated scene rebuilds @smoke @e2e', async ({ page }) => {
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  const disposeCount = await page.evaluate(async () => {
    const { BufferGeometry, CanvasTexture, MeshStandardMaterial, ThreeDungeonRenderer } = await import('/src/three_renderer.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const map = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    })));
    const open = (x, y, direction) => {
      const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = directions[direction];
      map[y][x].walls[direction] = false;
      map[y + dy][x + dx].walls[(direction + 2) % 4] = false;
    };
    open(2, 2, 0);
    open(2, 2, 1);
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 2;
    state.y = 2;
    state.dir = 0;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row) => row.map(() => true));
    state.map = map;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.roamingMonsters = [];
    updateUI();
    const canvas = document.createElement('canvas');
    canvas.id = 'material-lifecycle-probe';
    document.body.append(canvas);
    const renderer = new ThreeDungeonRenderer(canvas.id);
    const baseInput = dungeonRenderer.getRenderInput();
    const lifecycleInput = {
      ...baseInput,
      sceneVisibility: { ...baseInput.sceneVisibility, showTownBackground: false, showCombat: true },
      combatMonsters: [{ name: 'ライフサイクル検証敵', hp: 24, maxHp: 24, color: '#d45de6' }],
      combatTargetSelection: { active: true, targetType: 'enemy' },
    };
    const townInput = {
      ...lifecycleInput,
      sceneVisibility: { ...lifecycleInput.sceneVisibility, showTownBackground: true, showCombat: false },
      combatMonsters: [],
      combatTargetSelection: { active: false, targetType: '' },
    };
    const originalGeometryDispose = BufferGeometry.prototype.dispose;
    const originalTextureDispose = CanvasTexture.prototype.dispose;
    const originalMaterialDispose = MeshStandardMaterial.prototype.dispose;
    const disposeCalls = { geometry: 0, material: 0, texture: 0 };
    BufferGeometry.prototype.dispose = function disposeGeometrySpy() {
      disposeCalls.geometry += 1;
      return originalGeometryDispose.call(this);
    };
    CanvasTexture.prototype.dispose = function disposeTextureSpy() {
      disposeCalls.texture += 1;
      return originalTextureDispose.call(this);
    };
    MeshStandardMaterial.prototype.dispose = function disposeMaterialSpy() {
      disposeCalls.material += 1;
      return originalMaterialDispose.call(this);
    };
    let afterFirstBuild;
    let afterSecondBuild;
    let afterFinalBuild;
    let syntheticSurfaces;
    try {
      renderer.buildScene(lifecycleInput);
      afterFirstBuild = { ...disposeCalls };
      syntheticSurfaces = [];
      renderer.root.traverse((child) => {
        if (child.userData?.surface?.startsWith('side-branch-')) syntheticSurfaces.push(child.userData.surface);
      });
      renderer.buildScene(lifecycleInput);
      afterSecondBuild = { ...disposeCalls };
      renderer.buildScene(townInput);
      afterFinalBuild = { ...disposeCalls };
    } finally {
      BufferGeometry.prototype.dispose = originalGeometryDispose;
      CanvasTexture.prototype.dispose = originalTextureDispose;
      MeshStandardMaterial.prototype.dispose = originalMaterialDispose;
    }
    return {
      disposeCalls,
      afterFirstBuild,
      afterSecondBuild,
      afterFinalBuild,
      syntheticSurfaces,
    };
  });

  expect(disposeCount.afterFirstBuild.material).toBeGreaterThan(0);
  expect(disposeCount.afterFirstBuild.texture).toBe(0);
  expect(disposeCount.afterSecondBuild.geometry).toBeGreaterThan(disposeCount.afterFirstBuild.geometry);
  expect(disposeCount.afterSecondBuild.material).toBeGreaterThan(disposeCount.afterFirstBuild.material);
  expect(disposeCount.afterSecondBuild.texture).toBeGreaterThan(disposeCount.afterFirstBuild.texture);
  expect(disposeCount.afterFinalBuild.geometry).toBeGreaterThan(disposeCount.afterSecondBuild.geometry);
  expect(disposeCount.afterFinalBuild.material).toBeGreaterThan(disposeCount.afterSecondBuild.material);
  expect(disposeCount.afterFinalBuild.texture).toBeGreaterThan(disposeCount.afterSecondBuild.texture);
  expect(disposeCount.syntheticSurfaces).toEqual([]);
});

test('Three.js Dungeon View follows map topology for all four directions @smoke @e2e @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  const topologyResult = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { DungeonRenderer, dungeonRenderer } = await import('/src/renderer.js');
    const probeCanvas = document.createElement('canvas');
    probeCanvas.id = 'canvas-topology-probe';
    document.body.append(probeCanvas);
    const canvasRenderer = new DungeonRenderer(probeCanvas.id);
    const drawCanvasProbe = (input) => {
      canvasRenderer.ctx.clearRect(0, 0, probeCanvas.width, probeCanvas.height);
      canvasRenderer.draw3DCorridors(canvasRenderer.ctx, input);
      return Array.from(canvasRenderer.ctx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data)
        .reduce((sum, value) => sum + value, 0);
    };
    const makeCell = () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    });
    const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
    const carve = (x, y, dir) => {
      const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = offsets[dir];
      map[y][x].walls[dir] = false;
      map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
    };
    carve(4, 4, 0);
    carve(4, 4, 1);
    carve(4, 4, 2);
    carve(4, 3, 1);

    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.maps[state.floor - 1] = map;
    state.visitedMaps[state.floor - 1] = map.map(row => row.map(() => true));
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.dir = 0;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    updateUI();

    const observations = [0, 1, 2, 3].map((dir) => {
      state.dir = dir;
      state.mapRevision += 1;
      updateUI();
      dungeonRenderer.draw();
      const canvasChecksum = drawCanvasProbe(dungeonRenderer.getRenderInput());
      const canvasTopology = getVisibleCorridorTopology(map, 4, 4, dir);
      const threeTopology = dungeonRenderer.getSceneTopology();
      const surfaces = [];
      dungeonRenderer.root.traverse((child) => {
        const topology = child.userData?.topology;
        if (topology?.x === 4 && topology?.y === 4 && child.userData.surface) {
          surfaces.push({
            surface: child.userData.surface,
            position: [child.position.x, child.position.y, child.position.z].map(value => Number(value.toFixed(3))),
            rotationY: Number(child.rotation.y.toFixed(3)),
          });
        }
      });
      return {
        dir,
        current: threeTopology.find(({ z, column }) => z === 0 && column === 0),
        canvasFacts: canvasTopology.map(({ z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier }) => ({
          z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier,
        })),
        threeFacts: threeTopology.map(({ z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier }) => ({
          z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier,
        })),
        surfaces,
        profile: dungeonRenderer.activeProfile,
        canvasChecksum,
        signature: dungeonRenderer.sceneSignature,
      };
    });

    state.x = 5;
    state.y = 4;
    state.dir = 0;
    state.mapRevision += 1;
    updateUI();
    dungeonRenderer.draw();
    const movedCanvasChecksum = drawCanvasProbe(dungeonRenderer.getRenderInput());
    const movedTopology = dungeonRenderer.getSceneTopology();

    state.x = 4;
    state.y = 4;
    map[3][4].blockEnter[2] = true;
    map[3][4].event = 'midboss';
    state.dir = 0;
    state.mapRevision += 1;
    updateUI();
    dungeonRenderer.draw();
    const oneWaySurfaces = [];
    const oneWayVisuals = [];
    let dangerCuePosition = null;
    dungeonRenderer.root.traverse((child) => {
      const topology = child.userData?.topology;
      if (topology?.x === 4 && topology?.y === 4 && child.userData.surface) {
        oneWaySurfaces.push(child.userData.surface);
        if (child.userData.surface === 'front-wall-one-way') {
          oneWayVisuals.push({ transparent: child.material.transparent, opacity: child.material.opacity });
        }
      }
      if (child.userData?.surface === 'danger-cue') dangerCuePosition = child.position.z;
    });
    return {
      observations,
      oneWaySurfaces,
      oneWayVisuals,
      dangerCuePosition,
      movement: {
        signature: dungeonRenderer.sceneSignature,
        current: movedTopology.find(({ z, column }) => z === 0 && column === 0),
        canvasChecksum: movedCanvasChecksum,
      },
    };
  });

  const { observations, oneWaySurfaces, oneWayVisuals, dangerCuePosition, movement } = topologyResult;
  const oneWayScreenshot = await page.locator('#dungeon-canvas').screenshot({
    path: testInfo.outputPath('three-one-way-barrier-390px.png'),
  });
  await testInfo.attach('three-one-way-barrier-390px', {
    body: oneWayScreenshot,
    contentType: 'image/png',
  });
  const profile = observations[0].profile;
  expect(new Set(observations.map(({ signature }) => signature)).size).toBe(4);
  expect(observations.map(({ threeFacts }) => threeFacts)).toEqual(
    observations.map(({ canvasFacts }) => canvasFacts)
  );
  expect(observations.map(({ current }) => [current.leftBlocked, current.rightBlocked, current.frontBlocked])).toEqual([
    [true, false, false],
    [false, false, false],
    [false, true, false],
    [false, false, true],
  ]);
  expect(observations[3].threeFacts.some(({ z, column }) => z === 1 && column === 0)).toBe(false);
  expect(observations[0].surfaces.map(({ surface }) => surface)).toEqual(['floor', 'ceiling', 'left-wall']);
  expect(observations[2].surfaces.map(({ surface }) => surface)).toEqual(['floor', 'ceiling', 'right-wall']);
  expect(observations[3].surfaces.map(({ surface }) => surface)).toEqual(['floor', 'ceiling', 'front-wall']);
  const leftWall = observations[0].surfaces.find(({ surface }) => surface === 'left-wall');
  const rightWall = observations[2].surfaces.find(({ surface }) => surface === 'right-wall');
  const frontWall = observations[3].surfaces.find(({ surface }) => surface === 'front-wall');
  expect(leftWall).toEqual(expect.objectContaining({ rotationY: 0 }));
  expect(leftWall.position[0]).toBeCloseTo(-profile.cellWidth / 2, 3);
  expect(leftWall.position[1]).toBeCloseTo(profile.wallHeight / 2, 3);
  expect(rightWall).toEqual(expect.objectContaining({ rotationY: 0 }));
  expect(rightWall.position[0]).toBeCloseTo(profile.cellWidth / 2, 3);
  expect(rightWall.position[1]).toBeCloseTo(profile.wallHeight / 2, 3);
  expect(frontWall).toEqual(expect.objectContaining({ rotationY: 0 }));
  expect(frontWall.position[2]).toBeCloseTo(-profile.cellDepth / 2, 3);
  expect(frontWall.position[1]).toBeCloseTo(profile.wallHeight / 2, 3);
  expect(oneWaySurfaces).toContain('front-wall-one-way');
  expect(oneWaySurfaces).toContain('front-wall-one-way-chevron');
  expect(oneWayVisuals).toEqual([{ transparent: true, opacity: 0.42 }]);
  expect(dangerCuePosition).toBeGreaterThan(0.1);
  expect(movement.current).toMatchObject({ x: 5, y: 4 });
  expect(movement.signature).not.toBe(observations[0].signature);
  expect(movement.canvasChecksum).not.toBe(observations[0].canvasChecksum);
});

test('Canvas and Three.js render the same representative dungeon states for comparison @visual', async ({ page }, testInfo) => {
  const modes = ['canvas', 'three'];
  const measurements = {};

  for (const mode of modes) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(mode === 'three' ? '/?renderer=three' : '/');
    if (mode === 'three') await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');

    const firstDrawReadyMs = await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      const makeCell = () => ({ walls: [false, false, false, false], blockEnter: [false, false, false, false], type: 'empty' });
      state.party = [createStartingKitCharacter('arcana')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 4;
      state.x = 4;
      state.y = 4;
      state.dir = 0;
      state.gameState = 'explore';
      state.transitioning = false;
      state.map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
      state.map[4][5].walls[0] = true;
      state.map[3][4].event = 'midboss';
      state.roamingMonsters = [{ floor: 4, x: 4, y: 2, kind: 'elite', perception: 'visible' }];
      updateUI();
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      renderer.draw();
      const navigation = performance.getEntriesByType('navigation')[0];
      return Number((performance.now() - (navigation?.startTime || 0)).toFixed(1));
    });
    const exploreDangerScreenshot = await page.screenshot({ path: testInfo.outputPath(`${mode}-explore-danger.png`) });
    await testInfo.attach(`${mode}-explore-danger`, {
      body: exploreDangerScreenshot,
      contentType: 'image/png',
    });

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      state.gameState = 'combat';
      state.roamingMonsters = [];
      state.combatState = {
        phase: 'choose_actions',
        monsters: [
          { name: '禁書の番人', level: 5, hp: 30, maxHp: 30, color: '#54c8c3', spriteType: 'golem' },
          { name: '影の護衛', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
        ],
      };
      menuContext.type = '';
      menuContext.prevGameState = null;
      updateUI();
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      renderer.draw();
    });
    await page.screenshot({ path: testInfo.outputPath(`${mode}-combat-multiple.png`) });

    measurements[mode] = await page.evaluate(async (firstDrawReadyMs) => {
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      const renderInput = renderer.getRenderInput();
      const drawCallTimes = [];
      for (let index = 0; index < 31; index += 1) {
        const start = performance.now();
        renderer.draw(renderInput);
        if (index > 0) drawCallTimes.push(performance.now() - start);
      }
      const frameIntervals = await new Promise((resolve) => {
        const samples = [];
        let previous = performance.now();
        const sample = (now) => {
          const drawStart = performance.now();
          renderer.draw(renderInput);
          samples.push({ intervalMs: now - previous, drawMs: performance.now() - drawStart });
          previous = now;
          if (samples.length >= 31) resolve(samples);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const sorted = [...drawCallTimes].sort((left, right) => left - right);
      const sortedFrames = frameIntervals.map(({ intervalMs }) => intervalMs).sort((left, right) => left - right);
      const drawFrames = frameIntervals.map(({ drawMs }) => drawMs);
      return {
        firstDrawReadyMs,
        drawCallMedianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
        drawCallMaxMs: Number(Math.max(...drawCallTimes).toFixed(3)),
        sustainedDrawMedianMs: Number([...drawFrames].sort((left, right) => left - right)[Math.floor(drawFrames.length / 2)].toFixed(3)),
        sustainedDrawMaxMs: Number(Math.max(...drawFrames).toFixed(3)),
        frameMedianMs: Number(sortedFrames[Math.floor(sortedFrames.length / 2)].toFixed(3)),
        frameMaxMs: Number(Math.max(...frameIntervals.map(({ intervalMs }) => intervalMs)).toFixed(3)),
        longFrameCount: frameIntervals.filter(({ intervalMs }) => intervalMs > 50).length,
        jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
        canvasSize: [document.querySelector('#dungeon-canvas').width, document.querySelector('#dungeon-canvas').height],
      };
    }, firstDrawReadyMs);
  }

  console.log(`[issue-1146] renderer comparison ${JSON.stringify(measurements)}`);
  expect(measurements.canvas.canvasSize).toEqual([400, 260]);
  expect(measurements.three.canvasSize).toEqual([400, 260]);
});
