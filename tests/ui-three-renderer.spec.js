import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
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

test('Three.js Dungeon View makes six local topology archetypes readable at small mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

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
          'straight-corridor': [[4, 4, 0], [4, 3, 0], [4, 2, 0]],
          'dead-end': [],
          'left-turn': [[4, 4, 0], [4, 4, 3], [4, 3, 3]],
          'right-turn': [[4, 4, 0], [4, 4, 1], [4, 3, 1]],
          't-junction': [[4, 4, 0], [4, 4, 3], [4, 4, 1]],
          'cross-junction': [[4, 4, 0], [4, 4, 1], [4, 4, 2], [4, 4, 3], [4, 3, 0], [4, 2, 0], [4, 3, 1], [4, 3, 3]],
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

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        const topology = dungeonRenderer.getSceneTopology();
        const current = topology.find(({ z, column }) => z === 0 && column === 0);
        return {
          current: {
            leftBlocked: current.leftBlocked,
            rightBlocked: current.rightBlocked,
            frontBlocked: current.frontBlocked,
          },
          visible: topology.map(({ z, column }) => `${z}:${column}`).sort(),
        };
      });

      expect(evidence.current).toEqual(expect.objectContaining({
        leftBlocked: ['straight-corridor', 'dead-end', 'right-turn'].includes(archetype),
        rightBlocked: ['straight-corridor', 'dead-end', 'left-turn'].includes(archetype),
        frontBlocked: archetype === 'dead-end',
      }));
      if (archetype === 'straight-corridor') expect(evidence.visible).toContain('3:0');
      if (archetype === 'dead-end') expect(evidence.visible).toEqual(['0:0']);
      if (archetype === 'left-turn') expect(evidence.visible).toContain('0:-1');
      if (archetype === 'right-turn') expect(evidence.visible).toContain('0:1');
      if (archetype === 't-junction') expect(evidence.visible).toEqual(expect.arrayContaining(['0:-1', '0:1', '1:0']));
      if (archetype === 'cross-junction') expect(evidence.visible).toContain('2:0');

      await page.screenshot({
        path: testInfo.outputPath(`three-topology-${archetype}-${viewport.width}px.png`),
      });
    }
  }
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
  expect(combatDepth.frontWallZ).toBeCloseTo(0.1, 5);
  expect(combatDepth.monsterZ).toBeGreaterThan(combatDepth.frontWallZ);
  expect(combatDepth.targetZ).toBeGreaterThan(combatDepth.frontWallZ);

  await page.locator('#dungeon-canvas').click({ position: { x: 180, y: 150 } });
  await expect.poll(() => page.evaluate(() => window.__threeTarget)).toBe(0);
  await expect(page.locator('#combat-overlay')).toBeHidden();
});

test('Three.js Dungeon View disposes prototype materials across repeated scene rebuilds @e2e', async ({ page }) => {
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  const disposeCount = await page.evaluate(async () => {
    const { MeshStandardMaterial, ThreeDungeonRenderer } = await import('/src/three_renderer.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.createElement('canvas');
    canvas.id = 'material-lifecycle-probe';
    document.body.append(canvas);
    const renderer = new ThreeDungeonRenderer(canvas.id);
    const baseInput = dungeonRenderer.getRenderInput();
    const townInput = {
      ...baseInput,
      sceneVisibility: {
        showTownBackground: true,
        showCombat: false,
        showChest: false,
        showEventScene: false,
        showItemMenu: false,
      },
    };
    const originalDispose = MeshStandardMaterial.prototype.dispose;
    let disposeCalls = 0;
    MeshStandardMaterial.prototype.dispose = function disposeSpy() {
      disposeCalls += 1;
      return originalDispose.call(this);
    };
    try {
      renderer.buildScene(townInput);
      renderer.buildScene(townInput);
    } finally {
      MeshStandardMaterial.prototype.dispose = originalDispose;
    }
    return disposeCalls;
  });

  // Each town build creates two prototype StandardMaterials without adding
  // them to the scene, so both builds must dispose four prototypes explicitly.
  expect(disposeCount).toBe(4);
});

test('Three.js Dungeon View follows map topology for all four directions @e2e @visual', async ({ page }) => {
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
  expect(observations[0].surfaces).toContainEqual({ surface: 'left-wall', position: [-0.9, 1.8, 1.15], rotationY: 1.571 });
  expect(observations[2].surfaces).toContainEqual({ surface: 'right-wall', position: [0.9, 1.8, 1.15], rotationY: -1.571 });
  expect(observations[3].surfaces).toContainEqual({ surface: 'front-wall', position: [0, 1.8, 0.1], rotationY: 0 });
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
    await page.screenshot({ path: testInfo.outputPath(`${mode}-explore-danger.png`) });

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
