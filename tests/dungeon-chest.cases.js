import { test, expect } from './fixtures/browser-health.js';

const REPRESENTATIVE_FLOORS = [1, 6, 11, 16, 21, 26];

test('Pixi chest scene uses the current biome chest signature @visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const evidence = await page.evaluate(async floors => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { dungeonRenderer } = await import('/src/renderer_runtime.js');
    const { getFloorTheme } = await import('/src/data/floor_themes.js');
    const { getChestPropStyle } = await import('/src/chest_prop.js');
    const map = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      type: 'empty',
      event: null,
    })));
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.map = map;
    state.x = 3;
    state.y = 3;
    state.dir = 0;
    state.gameState = 'submenu';
    state.chestState = { style: 'wood_crate', phase: 'menu' };
    menuContext.type = 'chest_menu';
    menuContext.prevGameState = 'explore';

    const result = {};
    for (const floor of floors) {
      state.floor = floor;
      const style = getFloorTheme(floor).visualSignature.landmarks.chestStyle;
      dungeonRenderer.draw();
      const input = dungeonRenderer.getRenderInput();
      result[floor] = {
        style,
        safeStyle: getChestPropStyle(style),
        actorCount: dungeonRenderer.scene.layers.actors.children.length,
        renderCount: dungeonRenderer.renderCount,
        signature: dungeonRenderer.getDrawSignature(input),
      };
    }
    return result;
  }, REPRESENTATIVE_FLOORS);

  expect(Object.values(evidence).map(value => value.style)).toEqual([
    'wood_crate', 'stone_ossuary', 'bone_cache', 'sealed_book_coffer', 'iron_strongbox', 'abyss_reliquary',
  ]);
  expect(Object.values(evidence).every(value => value.safeStyle === value.style)).toBe(true);
  expect(Object.values(evidence).every(value => value.actorCount > 0)).toBe(true);
  expect(new Set(Object.values(evidence).map(value => value.signature)).size).toBe(6);
});
