import { test, expect } from './fixtures/browser-health.js';

test('jumping into a discovered pitfall descends from a lazily generated floor @e2e @smoke', async ({ page }) => {

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state, createSoloCharacter } = await import('/src/state.js');
    const { executeEnterDungeon, handleMove } = await import('/src/movement.js');

    state.party = [createSoloCharacter('Thief')];
    executeEnterDungeon(1);

    let edge = null;
    for (let y = 1; y < state.map.length - 1 && !edge; y++) {
      for (let x = 1; x < state.map[y].length - 1 && !edge; x++) {
        for (let dir = 0; dir < 4; dir++) {
          if (!state.map[y][x].walls[dir] && !state.map[y][x].blockEnter?.[dir]) {
            edge = { x, y, dir };
            break;
          }
        }
      }
    }
    if (!edge) throw new Error('No passable edge found for pitfall test');

    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const trapX = edge.x + dx[edge.dir];
    const trapY = edge.y + dy[edge.dir];
    state.x = edge.x;
    state.y = edge.y;
    state.dir = edge.dir;
    state.map[trapY][trapX].trap = {
      id: 'browser_pitfall_lazy_floor',
      floorId: 'B1',
      position: { x: trapX, y: trapY },
      type: 'pitfall',
      state: 'discovered',
      difficulty: 30
    };

    handleMove('forward');
  });

  await expect(page.locator('#btn-trap-force')).toHaveText('飛び込む');
  await expect.poll(async () => {
    const location = await page.locator('#location-label').textContent();
    if (!location?.includes('B2F')) await page.locator('#btn-trap-force').click();
    return location;
  }).toContain('B2F');
  await expect(page.locator('#explore-controls')).toBeVisible();
  await expect(page.locator('#btn-move-forward')).toBeVisible();
  await expect(page.locator('#trap-controls')).toBeHidden();
});
