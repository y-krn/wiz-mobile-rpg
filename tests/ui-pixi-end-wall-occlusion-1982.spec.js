import { test, expect } from './fixtures/browser-health.js';

// #1982: cells behind a dead end are in the visible topology when a side
// passage loops around to them. The nearer end wall must hide everything
// there (floor, side walls, end walls, and objects), so the frame is the same
// as if the loop were closed off.
async function renderLoop(page, { closed, chest }) {
  return page.evaluate(async ({ closed, chest }) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const { dungeonRenderer: renderer } = await import('/src/renderer.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const size = 7;
    const map = Array.from({ length: size }, () => Array.from({ length: size }, () => ({
      walls: [true, true, true, true], blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false], secretFound: [false, false, false, false],
      type: 'empty', event: null, message: null,
    })));
    const open = (x, y, dir) => {
      const dx = [0, 1, 0, -1][dir];
      const dy = [-1, 0, 1, 0][dir];
      map[y][x].walls[dir] = false;
      map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
    };
    // The player faces north into a dead end at (3, 5). East, north, and back
    // west reaches (3, 4) behind that wall, whose corridor runs on north.
    open(3, 5, 1); open(4, 5, 0); open(3, 4, 0); open(3, 3, 0); open(3, 2, 0);
    if (!closed) open(4, 4, 3);
    if (chest) map[4][3].event = 'chest';
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1; state.x = 3; state.y = 5; state.dir = 0;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.map = map; state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore'; state.transitioning = false; state.combatState = null; state.roamingMonsters = [];
    menuContext.type = ''; menuContext.targetType = ''; menuContext.prevGameState = null;
    updateUI();
    renderer.cancelNavigationTransition();
    renderer.resize();
    renderer.draw(renderer.getRenderInput());
    // Read exactly the viewport; content bounds vary with off-screen geometry.
    const frame = renderer.app.stage.getBounds().rectangle.clone();
    frame.x = 0; frame.y = 0; frame.width = renderer.viewport.width; frame.height = renderer.viewport.height;
    window.__issue1982Frames = window.__issue1982Frames || {};
    window.__issue1982Frames[closed ? 'closed' : 'looped'] = renderer.app.renderer.extract.pixels({ target: renderer.app.stage, frame }).pixels;
    return getVisibleCorridorTopology(map, 3, 5, 0).some(cell => cell.z === 1 && cell.column === 0);
  }, { closed, chest });
}

test('PixiJS dead end hides the corridor, walls, and chest looped behind it @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  // Let the canvas settle to the portrait viewport before comparing frames.
  await page.waitForFunction(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    return dungeonRenderer.resize().height > dungeonRenderer.resize().width;
  });

  for (const chest of [true, false]) {
    expect(await renderLoop(page, { closed: false, chest }), 'the looped cell behind the dead end is in the visible topology').toBe(true);
    expect(await renderLoop(page, { closed: true, chest })).toBe(false);
    const comparison = await page.evaluate(() => {
      const { looped, closed } = window.__issue1982Frames;
      // Count pixels that visibly change. Anti-aliased seams at the wall's
      // corners may shift by a few levels; a leaked wall or chest does not.
      let visible = 0;
      for (let index = 0; index < looped.length; index += 4) {
        const delta = Math.max(
          Math.abs(looped[index] - closed[index]),
          Math.abs(looped[index + 1] - closed[index + 1]),
          Math.abs(looped[index + 2] - closed[index + 2])
        );
        if (delta > 40) visible += 1;
      }
      return { sameSize: looped.length === closed.length, visible };
    });
    expect(comparison.sameSize).toBe(true);
    expect(comparison.visible, `chest=${chest}: nothing behind the dead end shows through`).toBe(0);
  }
});
