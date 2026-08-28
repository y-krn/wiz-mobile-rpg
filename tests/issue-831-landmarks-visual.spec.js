import { test, expect } from './fixtures/browser-health.js';

const REPRESENTATIVE_FLOORS = [1, 6, 11, 16, 21, 26];

test('Representative biome landmarks keep distinct silhouettes and remain readable @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const evidence = {};
  for (const floor of REPRESENTATIVE_FLOORS) {
    evidence[floor] = await page.evaluate(async targetFloor => {
      const { state, createDefaultCurrentRun } = await import('/src/state.js');
      const { dungeonRenderer, getProjectionPlanes } = await import('/src/renderer.js');
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

      const scene = {
        showTownBackground: false,
        showCombat: false,
        showChest: false,
        showEventScene: true,
        showItemMenu: false,
      };
      dungeonRenderer.draw(scene);

      const style = getFloorTheme(targetFloor).visualSignature.landmarks;
      const projection = getProjectionPlanes({ corridorWidth: 1, ceilingHeight: 1, wallLean: 0, ceilingStyle: 'flat' });
      const silhouette = (category, value) => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 260;
        const ctx = canvas.getContext('2d');
        if (category === 'stairs') dungeonRenderer.drawStairsIcon(ctx, 1, 'stairs-down', value, projection);
        if (category === 'chest') dungeonRenderer.drawChestIcon(ctx, 1, value, projection);
        if (category === 'trap') dungeonRenderer.drawTrapIcon(ctx, 1, false, value, projection);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let index = 3; index < pixels.length; index += 4) {
          hash ^= pixels[index] > 20 ? 1 : 0;
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      };

      return {
        style,
        silhouettes: {
          stairs: silhouette('stairs', style.stairsStyle),
          chest: silhouette('chest', style.chestStyle),
          trap: silhouette('trap', style.trapStyle),
        },
      };
    }, floor);
    await page.screenshot({
      path: testInfo.outputPath(`issue-831-landmarks-B${floor}.png`),
      fullPage: true,
    });
  }

  for (const category of ['stairs', 'chest', 'trap']) {
    const signatures = REPRESENTATIVE_FLOORS.map(floor => evidence[floor].silhouettes[category]);
    expect(new Set(signatures).size, `${category} silhouettes should differ across adjacent biomes`).toBe(REPRESENTATIVE_FLOORS.length);
  }
  expect(evidence[1].style).toEqual({ chestStyle: 'wood_crate', trapStyle: 'rockfall_mark', stairsStyle: 'rough_stone' });
  expect(evidence[26].style).toEqual({ chestStyle: 'abyss_reliquary', trapStyle: 'void_sigill', stairsStyle: 'impossible_stair' });
});
