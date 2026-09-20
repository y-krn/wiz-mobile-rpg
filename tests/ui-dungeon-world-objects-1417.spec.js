import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const OBJECTS = [
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
    const { getProjectionColumn, getProjectionPlanes } = await import('/src/rules/renderer_projection.js');
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
    const plane = getProjectionColumn(projection, 1, 0);
    const geometry = target.id === 'spring'
      ? getSpringPropGeometry(plane)
      : target.id === 'monument'
        ? getMonumentPropGeometry(plane)
        : getStairsPropGeometry(plane, 'down', input.visual.landmarks?.stairsStyle);
    return {
      canvasRenderer: document.querySelector('#dungeon-canvas')?.dataset.renderer || null,
      viewport: [dungeonRenderer.viewport.width, dungeonRenderer.viewport.height],
      actorChildren: dungeonRenderer.scene.layers.actors.children.length,
      plane: { bottom: plane.bottom, width: plane.rightBottom - plane.leftBottom },
      prop: {
        width: geometry.width,
        baseY: geometry.baseY,
        shadowY: geometry.shadow.y,
        shapeCount: target.id === 'spring'
          ? geometry.pedestal.length + 2
          : target.id === 'monument'
            ? geometry.face.length + geometry.inscriptionLines.length
            : geometry.steps.length,
        depthScale: geometry.width / Math.max(1, plane.rightBottom - plane.leftBottom),
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
      expect(evidence[object.id].actorChildren).toBeGreaterThan(0);
      expect(evidence[object.id].prop.shapeCount).toBeGreaterThan(2);
      expect(evidence[object.id].prop.shadowY).toBeGreaterThan(evidence[object.id].prop.baseY);
      expect(evidence[object.id].prop.depthScale).toBeGreaterThan(0);

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`issue-1417-${object.id}-${viewport.width}x${viewport.height}.png`),
      });
      await testInfo.attach(`issue-1417-${object.id}-${viewport.width}x${viewport.height}`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }

    const raw = Buffer.from(JSON.stringify({ viewport, evidence }, null, 2));
    await testInfo.attach(`issue-1417-${viewport.width}x${viewport.height}-raw`, {
      body: raw,
      contentType: 'application/json',
    });
    expect(new Set(OBJECTS.map(object => evidence[object.id].prop.shapeCount)).size).toBe(3);
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
