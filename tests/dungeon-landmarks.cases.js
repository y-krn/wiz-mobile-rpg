import { test, expect } from './fixtures/browser-health.js';

const REPRESENTATIVE_FLOORS = [1, 6, 11, 16, 21, 26];

test('Pixi landmarks keep biome-specific geometry and remain readable @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const evidence = {};
  for (const floor of REPRESENTATIVE_FLOORS) {
    evidence[floor] = await page.evaluate(async targetFloor => {
      const { state, createDefaultCurrentRun } = await import('/src/state.js');
      const { dungeonRenderer } = await import('/src/renderer_runtime.js');
      const { getProjectionPlanes, getWorldObjectProjection } = await import('/src/rules/renderer_projection.js');
      const { getChestPropGeometry } = await import('/src/chest_prop.js');
      const { getFloorTheme } = await import('/src/data/floor_themes.js');
      const makeCell = () => ({
        walls: [false, false, false, false],
        blockEnter: [false, false, false, false],
        secretDoor: [false, false, false, false],
        type: 'empty',
        event: null,
      });
      const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, makeCell));
      map[5][5].type = 'stairs-up';
      map[4][5].type = 'stairs-down';
      map[3][5].event = 'chest';
      map[2][5].trap = { state: 'discovered', traceReadLevel: 1 };

      state.currentRun = createDefaultCurrentRun();
      state.floor = targetFloor;
      state.x = 5;
      state.y = 5;
      state.dir = 0;
      state.gameState = 'explore';
      state.maps[targetFloor - 1] = map;
      state.visitedMaps[targetFloor - 1] = map.map(row => row.map(() => true));
      state.map = map;

      dungeonRenderer.draw();
      const input = dungeonRenderer.getRenderInput();
      const projection = getProjectionPlanes(input.visual.geometry, dungeonRenderer.viewport);
      const chestPlane = getWorldObjectProjection(projection, 1);
      const chest = getChestPropGeometry(chestPlane, input.visual.landmarks.chestStyle);
      return {
        style: getFloorTheme(targetFloor).visualSignature.landmarks,
        chestShape: [chest.lid, chest.body, chest.lock],
        worldObjectCount: dungeonRenderer.scene.layers['world-objects'].children.length,
        renderCount: dungeonRenderer.renderCount,
      };
    }, floor);
    await page.screenshot({
      path: testInfo.outputPath(`dungeon-landmarks-B${floor}.png`),
      fullPage: true,
    });
  }

  expect(new Set(REPRESENTATIVE_FLOORS.map(floor => JSON.stringify(evidence[floor].chestShape))).size)
    .toBe(REPRESENTATIVE_FLOORS.length);
  expect(REPRESENTATIVE_FLOORS.every(floor => evidence[floor].worldObjectCount > 0)).toBe(true);
  expect(evidence[1].style).toEqual({ chestStyle: 'wood_crate', trapStyle: 'rockfall_mark', stairsStyle: 'rough_stone' });
  expect(evidence[26].style).toEqual({ chestStyle: 'abyss_reliquary', trapStyle: 'void_sigill', stairsStyle: 'impossible_stair' });
});
