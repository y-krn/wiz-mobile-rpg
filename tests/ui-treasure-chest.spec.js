import { test, expect } from './fixtures/browser-health.js';

const EVIDENCE_VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 320, height: 568, label: '320' },
  { width: 430, height: 932, label: '430' },
];

function makeChestMap() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: 'empty',
    event: null,
  })));
  map[4][4].walls[0] = false;
  map[3][4].walls[2] = false;
  map[3][4].event = 'chest';
  return map;
}

async function seedChest(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async map => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
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
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    Object.assign(menuContext, { type: '', targetType: '', prevGameState: null });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer_runtime.js');
    dungeonRenderer.draw();
  }, makeChestMap());
  await page.waitForTimeout(100);
}

test('Pixi treasure chest prop stays readable across mobile widths @visual', async ({ page }, testInfo) => {
  const evidence = {};
  for (const viewport of EVIDENCE_VIEWPORTS) {
    await seedChest(page, viewport);
    evidence[viewport.label] = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer_runtime.js');
      const { getChestPropGeometry } = await import('/src/chest_prop.js');
      const { getProjectionPlanes, getWorldObjectProjection } = await import('/src/rules/renderer_projection.js');
      dungeonRenderer.draw();
      const input = dungeonRenderer.getRenderInput();
      const projection = getProjectionPlanes(input.visual.geometry, dungeonRenderer.viewport);
      const geometry = getChestPropGeometry(getWorldObjectProjection(projection, 1), input.visual.landmarks.chestStyle);
      return {
        renderer: dungeonRenderer.mode,
        viewport: dungeonRenderer.viewport,
        chest: {
          style: geometry.style,
          bodyPoints: geometry.body.length,
          lidPoints: geometry.lid.length,
          lockWidth: geometry.lock.width,
          floorShadowRadius: geometry.shadow.radiusX,
          width: geometry.width,
          height: geometry.bodyHeight + geometry.lidHeight,
        },
        worldObjectCount: dungeonRenderer.scene.layers['world-objects'].children.length,
      };
    });
    const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1383-pixi-${viewport.label}.png`) });
    await testInfo.attach(`issue-1383-pixi-${viewport.label}`, { body: screenshot, contentType: 'image/png' });
  }

  for (const entry of Object.values(evidence)) {
    expect(entry.renderer).toBe('pixi');
    expect(entry.chest.bodyPoints).toBeGreaterThanOrEqual(4);
    expect(entry.chest.lidPoints).toBeGreaterThanOrEqual(4);
    expect(entry.chest.lockWidth).toBeGreaterThan(0);
    expect(entry.chest.floorShadowRadius).toBeGreaterThan(0);
    expect(entry.chest.width).toBeGreaterThan(4);
    expect(entry.chest.height).toBeGreaterThan(4);
    expect(entry.worldObjectCount).toBeGreaterThan(0);
  }
});
