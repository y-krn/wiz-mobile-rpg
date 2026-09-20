import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const OBJECTS = [
  { id: 'chest', event: 'chest' },
  { id: 'spring', event: 'event_spring' },
  { id: 'monument', event: 'event_tablet' },
  { id: 'stairs', type: 'stairs-down' },
];

async function renderObject(page, object) {
  return page.evaluate(async target => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { closeSubmenu } = await import('/src/navigation.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getProjectionColumn, getProjectionPlanes, getWorldObjectProjection } = await import('/src/rules/renderer_projection.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { getChestPropGeometry } = await import('/src/chest_prop.js');
    const { getMonumentPropGeometry, getSpringPropGeometry, getStairsPropGeometry } = await import('/src/dungeon_prop.js');
    const makeCell = () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      type: 'empty',
      event: null,
    });
    const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, makeCell));
    const objectCell = map[4][5];
    objectCell.walls[0] = true;
    if (target.type) objectCell.type = target.type;
    if (target.event) objectCell.event = target.event;

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
    const plane = getWorldObjectProjection(projection, 1, 0);
    const wallPlane = getProjectionColumn(projection, 2, 0);
    const topologyCell = getVisibleCorridorTopology(map, state.x, state.y, state.dir)
      .find(cell => cell.z === 1 && cell.column === 0);
    const geometry = target.id === 'chest'
      ? getChestPropGeometry(plane, input.visual.landmarks?.chestStyle)
      : target.id === 'spring'
      ? getSpringPropGeometry(plane)
      : target.id === 'monument'
        ? getMonumentPropGeometry(plane)
        : getStairsPropGeometry(plane, 'down', input.visual.landmarks?.stairsStyle);
    const points = target.id === 'chest'
      ? [...geometry.body, ...geometry.side, ...geometry.lid]
      : target.id === 'spring'
      ? [
        { x: geometry.basin.x - geometry.basin.radiusX, y: geometry.basin.y - geometry.basin.radiusY },
        { x: geometry.basin.x + geometry.basin.radiusX, y: geometry.basin.y + geometry.basin.radiusY },
        ...geometry.fountain,
        ...geometry.pedestal,
      ]
      : target.id === 'monument'
        ? [...geometry.face, ...geometry.side, ...geometry.plinth]
        : [...geometry.well, ...geometry.steps.flatMap(step => step.points)];
    const objectTop = Math.min(...points.map(point => point.y));
    const objectBottom = Math.max(...points.map(point => point.y));
    const controlsTop = document.querySelector('#controls-panel')?.getBoundingClientRect().top ?? window.innerHeight;
    return {
      canvasRenderer: document.querySelector('#dungeon-canvas')?.dataset.renderer || null,
      viewport: [dungeonRenderer.viewport.width, dungeonRenderer.viewport.height],
      actorChildren: dungeonRenderer.scene.layers.actors.children.length,
      worldObjectChildren: dungeonRenderer.scene.layers['world-objects'].children.length,
      layerOrder: Object.keys(dungeonRenderer.scene.layers),
      topology: {
        visible: Boolean(topologyCell),
        frontWall: topologyCell?.frontWall || false,
        frontBlocked: topologyCell?.frontBlocked || false,
      },
      plane: { bottom: plane.bottom, width: plane.rightBottom - plane.leftBottom, floorContactY: plane.worldObject.floorContactY },
      wallPlane: { top: wallPlane.top, bottom: wallPlane.bottom },
      prop: {
        width: geometry.width,
        baseY: geometry.baseY,
        shadowY: geometry.shadow.y,
        shapeCount: target.id === 'chest'
          ? geometry.body.length + geometry.lid.length
          : target.id === 'spring'
          ? geometry.pedestal.length + 2
          : target.id === 'monument'
            ? geometry.face.length + geometry.inscriptionLines.length
            : geometry.steps.length,
        depthScale: plane.worldObject.scale,
        objectTop,
        objectBottom,
        controlsTop,
        floorContactVisible: geometry.shadow.y < controlsTop,
        visibleSilhouetteHeight: Math.max(0, Math.min(objectBottom, controlsTop) - objectTop),
      },
      activeObjectObservationKeys: Object.keys(state.currentRun.eventObservations)
        .filter(key => /:(spring|tablet|stairs):/.test(key)),
    };
  }, object);
}

for (const viewport of VIEWPORTS) {
  test(`Pixi world objects remain recognizable at ${viewport.width}x${viewport.height} @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await page.waitForLoadState('networkidle');

    const evidence = {};
    for (const object of OBJECTS) {
      evidence[object.id] = await renderObject(page, object);
      expect(evidence[object.id].canvasRenderer).toBe('pixi');
      expect(evidence[object.id].worldObjectChildren).toBeGreaterThan(0);
      expect(evidence[object.id].actorChildren).toBe(0);
      expect(evidence[object.id].topology.visible).toBe(true);
      expect(evidence[object.id].topology.frontWall).toBe(true);
      expect(evidence[object.id].topology.frontBlocked).toBe(true);
      expect(evidence[object.id].layerOrder.indexOf('world-objects')).toBeLessThan(evidence[object.id].layerOrder.indexOf('structural-walls'));
      expect(evidence[object.id].prop.objectBottom).toBeGreaterThan(evidence[object.id].wallPlane.bottom);
      expect(evidence[object.id].prop.shapeCount).toBeGreaterThan(2);
      expect(evidence[object.id].prop.shadowY).toBeGreaterThan(evidence[object.id].prop.baseY);
      expect(evidence[object.id].prop.depthScale).toBeGreaterThan(0);
      expect(evidence[object.id].prop.floorContactVisible).toBe(true);
      expect(evidence[object.id].prop.baseY).toBeLessThan(evidence[object.id].prop.controlsTop - 4);
      expect(evidence[object.id].prop.visibleSilhouetteHeight).toBeGreaterThanOrEqual(20);

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`issue-1424-${object.id}-${viewport.width}x${viewport.height}.png`),
      });
      await testInfo.attach(`issue-1424-${object.id}-${viewport.width}x${viewport.height}`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }

    const raw = Buffer.from(JSON.stringify({ viewport, evidence }, null, 2));
    await testInfo.attach(`issue-1424-${viewport.width}x${viewport.height}-raw`, {
      body: raw,
      contentType: 'application/json',
    });
    expect(new Set(OBJECTS.map(object => evidence[object.id].prop.shapeCount)).size).toBe(4);
    expect(evidence.chest.activeObjectObservationKeys).toEqual([]);
    expect(evidence.spring.activeObjectObservationKeys).toEqual([]);
    expect(evidence.monument.activeObjectObservationKeys).toEqual([]);
    expect(evidence.stairs.activeObjectObservationKeys).toEqual([]);
  });
}

test('spring, monument, and stairs no longer create player-facing aura cues @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await page.waitForLoadState('networkidle');
  const observations = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { processExplorationResolution } = await import('/src/movement.js');
    const makeCell = () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      type: 'empty',
      event: null,
    });
    const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, makeCell));
    map[4][4].event = 'event_spring';
    map[4][5].event = 'event_tablet';
    map[4][6].type = 'stairs-down';
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.eventObservations = {};
    state.gameState = 'explore';
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.map = map;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.roamingMonsters = [];
    state.forcedEncounterSteps = 0;
    const originalRandom = Math.random;
    Math.random = () => 0.99;
    try {
      processExplorationResolution(5, 5);
    } finally {
      Math.random = originalRandom;
    }
    return Object.keys(state.currentRun.eventObservations).filter(key => /:(spring|tablet|stairs):/.test(key));
  });
  expect(observations).toEqual([]);
});

test('world objects beyond a solid front wall are absent from Pixi presentation @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await page.waitForLoadState('networkidle');
  const evidence = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const makeCell = () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      type: 'empty',
      event: null,
    });
    const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, () => ({
      ...makeCell(),
      walls: [true, true, true, true],
    })));
    map[5][5].walls[0] = false;
    map[4][5].walls[2] = false;
    map[4][5].walls[0] = true;
    map[3][5].event = 'event_spring';
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.floor = 1;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.map = map;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    updateUI();
    dungeonRenderer.draw();
    const topology = getVisibleCorridorTopology(map, state.x, state.y, state.dir);
    return {
      renderer: document.querySelector('#dungeon-canvas')?.dataset.renderer || null,
      worldObjectChildren: dungeonRenderer.scene.layers['world-objects'].children.length,
      actorChildren: dungeonRenderer.scene.layers.actors.children.length,
      visibleObjectCells: topology.filter(cell => cell.z > 0 && cell.column === 0).map(cell => `${cell.x}:${cell.y}`),
      blockedFrontCell: topology.find(cell => cell.z === 1 && cell.column === 0)?.frontBlocked || false,
      occludedCellInTopology: Boolean(topology.find(cell => cell.z === 2 && cell.column === 0)),
    };
  });
  expect(evidence.renderer).toBe('pixi');
  expect(evidence.worldObjectChildren).toBe(0);
  expect(evidence.actorChildren).toBe(0);
  expect(evidence.blockedFrontCell).toBe(true);
  expect(evidence.occludedCellInTopology).toBe(false);
});
