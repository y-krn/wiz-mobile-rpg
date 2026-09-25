import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const OBJECTS = [
  { id: 'chest', event: 'chest' },
  { id: 'spring', event: 'event_spring' },
  { id: 'stairs', type: 'stairs-down' },
];

async function renderDepth(page, depth, target) {
  return page.evaluate(async ({ depth, target }) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { closeSubmenu } = await import('/src/navigation.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getProjectionPlanes, getWorldObjectProjection } = await import('/src/rules/renderer_projection.js');
    const { getChestPropGeometry } = await import('/src/chest_prop.js');
    const { getSpringPropGeometry, getStairsPropGeometry } = await import('/src/dungeon_prop.js');

    const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      type: 'empty',
      event: null,
    })));
    const cell = map[5 - depth][5];
    cell.walls[0] = true;
    if (target.type) cell.type = target.type;
    if (target.event) cell.event = target.event;

    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.eventObservations = {};
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.chestState = null;
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.map = map;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    closeSubmenu();
    updateUI();
    dungeonRenderer.resize(window.innerWidth, window.innerHeight);
    dungeonRenderer.draw();

    const input = dungeonRenderer.getRenderInput();
    const projection = getProjectionPlanes(input.visual.geometry, dungeonRenderer.viewport);
    const plane = getWorldObjectProjection(projection, depth, 0);
    const geometry = target.id === 'chest'
      ? getChestPropGeometry(plane, input.visual.landmarks?.chestStyle)
      : target.id === 'spring'
      ? getSpringPropGeometry(plane)
      : getStairsPropGeometry(plane, 'down', input.visual.landmarks?.stairsStyle);
    const points = target.id === 'chest'
      ? [...geometry.body, ...geometry.side, ...geometry.lid]
      : target.id === 'spring'
      ? [...geometry.fountain, ...geometry.pedestal]
      : [...geometry.well, ...geometry.steps.flatMap(step => step.points)];
    const top = Math.min(...points.map(point => point.y));
    const bottom = Math.max(...points.map(point => point.y));
    const controlsTop = document.querySelector('#controls-panel')?.getBoundingClientRect().top ?? window.innerHeight;
    return {
      renderer: dungeonRenderer.mode,
      viewport: dungeonRenderer.viewport,
      worldObjectChildren: dungeonRenderer.scene.layers['world-objects'].children.length,
      actorChildren: dungeonRenderer.scene.layers.actors.children.length,
      projection: {
        depth,
        corridorWidth: plane.worldObject.corridorWidth,
        projectedWidth: geometry.width,
        projectedHeight: bottom - top,
        centerX: geometry.centerX,
        baseY: geometry.baseY,
        floorContactY: plane.worldObject.floorContactY,
        scale: plane.worldObject.scale,
      },
      visibleSilhouetteHeight: Math.max(0, Math.min(bottom, controlsTop) - top),
      floorContactVisible: geometry.shadow.y < controlsTop,
    };
  }, { depth, target });
}

for (const viewport of VIEWPORTS) {
  test(`Pixi world objects follow corridor depth at ${viewport.width}x${viewport.height} @visual @smoke`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await page.waitForLoadState('networkidle');

    const evidence = {};
    for (const target of OBJECTS) {
      evidence[target.id] = {};
      for (const depth of [3, 2, 1]) {
        evidence[target.id][depth] = await renderDepth(page, depth, target);
        const screenshot = await page.locator('#dungeon-canvas').screenshot({
          path: testInfo.outputPath(`issue-1448-${target.id}-depth-${depth}-${viewport.width}x${viewport.height}.png`),
        });
        await testInfo.attach(`issue-1448-${target.id}-depth-${depth}-${viewport.width}x${viewport.height}`, {
          body: screenshot,
          contentType: 'image/png',
        });
      }

      const samples = [evidence[target.id][1], evidence[target.id][2], evidence[target.id][3]];
      const widths = samples.map(sample => sample.projection.projectedWidth);
      const heights = samples.map(sample => sample.projection.projectedHeight);
      const bases = samples.map(sample => sample.projection.baseY);
      expect(samples.every(sample => sample.renderer === 'pixi')).toBe(true);
      expect(samples.every(sample => sample.worldObjectChildren > 0 && sample.actorChildren === 0)).toBe(true);
      expect(widths[0]).toBeGreaterThan(widths[1]);
      expect(widths[1]).toBeGreaterThan(widths[2]);
      expect(heights[0]).toBeGreaterThan(heights[1]);
      expect(heights[1]).toBeGreaterThan(heights[2]);
      expect(bases[0]).toBeGreaterThan(bases[1]);
      expect(bases[1]).toBeGreaterThan(bases[2]);
      expect(widths[0] / widths[1]).toBeLessThan(1.65);
      expect(widths[1] / widths[2]).toBeLessThan(1.65);
      expect(samples.every(sample => sample.projection.centerX === viewport.width / 2)).toBe(true);
      expect(samples.every(sample => sample.projection.floorContactY === sample.projection.baseY)).toBe(true);
      expect(samples.every(sample => sample.floorContactVisible && sample.visibleSilhouetteHeight > 12)).toBe(true);
    }

    await testInfo.attach(`issue-1448-depth-raw-${viewport.width}x${viewport.height}`, {
      body: Buffer.from(JSON.stringify({ viewport, evidence }, null, 2)),
      contentType: 'application/json',
    });
  });
}
