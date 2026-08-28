import { test, expect } from './fixtures/browser-health.js';

const REPRESENTATIVE_FLOORS = [1, 6, 11, 16, 21, 26];

test('Chest scene uses the current biome chest signature @visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const evidence = await page.evaluate(async floors => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer, getProjectionPlanes } = await import('/src/renderer.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');

    const hashCanvas = () => {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index++) {
        hash ^= pixels[index];
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    };
    const render = callback => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      callback();
      return hashCanvas();
    };

    const projection = getProjectionPlanes({
      corridorWidth: 1,
      ceilingHeight: 1,
      wallLean: 0,
      ceilingStyle: 'flat',
    });
    const result = {};
    for (const floor of floors) {
      state.floor = floor;
      const style = getFloorTheme(floor).visualSignature.landmarks.chestStyle;
      result[floor] = {
        style,
        scene: render(() => dungeonRenderer.drawChest(ctx)),
        explicitScene: render(() => dungeonRenderer.drawChest(ctx, style)),
        exploration: render(() => dungeonRenderer.drawChestIcon(ctx, 1, style, projection)),
      };
    }

    const woodChest = result[1].explicitScene;
    result.unknownStyle = render(() => dungeonRenderer.drawChest(ctx, 'unknown_chest_style'));
    return { result, woodChest };
  }, REPRESENTATIVE_FLOORS);

  expect(Object.values(evidence.result).filter(value => value?.style).map(value => value.style)).toEqual([
    'wood_crate',
    'stone_ossuary',
    'bone_cache',
    'sealed_book_coffer',
    'iron_strongbox',
    'abyss_reliquary',
  ]);

  for (const floor of REPRESENTATIVE_FLOORS) {
    expect(evidence.result[floor].scene, `B${floor} should resolve its biome chest style`).toBe(
      evidence.result[floor].explicitScene,
    );
  }
  expect(new Set(REPRESENTATIVE_FLOORS.map(floor => evidence.result[floor].scene)).size).toBe(6);
  expect(new Set(REPRESENTATIVE_FLOORS.map(floor => evidence.result[floor].exploration)).size).toBe(6);
  expect(evidence.result.unknownStyle).toBe(evidence.woodChest);
});
