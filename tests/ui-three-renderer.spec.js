import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

test('Three.js Dungeon View keeps the four shell regions and renders at mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('#dungeon-canvas');
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
      };
    });

    expect(layout.webgl).toBe(true);
    expect(layout.canvasSize).toEqual([400, 260]);
    expect(layout.regions).toEqual(expect.arrayContaining([
      'minimal-hud', 'dungeon-view', 'current-event-strip', 'action-dock',
    ]));
    expect(layout.canvas.width).toBeGreaterThan(0);
    expect(layout.canvas.height).toBeGreaterThan(0);
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
    state.gameState = 'combat';
    state.transitioning = false;
    state.map = [[{ walls: [false, false, false, false], blockEnter: [false, false, false, false], type: 'empty' }]];
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

  await page.locator('#dungeon-canvas').click({ position: { x: 180, y: 150 } });
  await expect.poll(() => page.evaluate(() => window.__threeTarget)).toBe(0);
  await expect(page.locator('#combat-overlay')).toBeHidden();
});

test('Three.js Dungeon View follows map topology for all four directions @e2e @visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  const observations = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
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

    return [0, 1, 2, 3].map((dir) => {
      state.dir = dir;
      state.mapRevision += 1;
      updateUI();
      dungeonRenderer.draw();
      const canvasTopology = getVisibleCorridorTopology(map, 4, 4, dir);
      const threeTopology = dungeonRenderer.getSceneTopology();
      const surfaces = [];
      dungeonRenderer.root.traverse((child) => {
        const topology = child.userData?.topology;
        if (topology?.x === 4 && topology?.y === 4 && child.userData.surface) {
          surfaces.push(child.userData.surface);
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
        signature: dungeonRenderer.sceneSignature,
      };
    });
  });

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
  expect(observations[3].surfaces).toContain('front-wall');
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
