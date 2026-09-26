import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };

// 9x9 closed cells; the start cell (4,4) faces north. With oneWay, the north
// wall is open but the next cell refuses entry from the south.
function makeMap(oneWay) {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false],
    type: 'empty',
  })));
  if (oneWay) {
    map[4][4].walls[0] = false;
    map[3][4].walls[2] = false;
    map[3][4].blockEnter[2] = true;
  }
  return map;
}

async function seedExplore(page, { oneWay = false } = {}) {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async (map) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('vanguard')];
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
    state.logs = [];
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    // Count persistence writes caused by the bumps below.
    window.__saveWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) {
      window.__saveWrites += 1;
      return original.apply(this, args);
    };
  }, makeMap(oneWay));
}

async function snapshot(page) {
  return page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      x: state.x,
      y: state.y,
      dir: state.dir,
      gameState: state.gameState,
      logs: state.logs.length,
      run: JSON.stringify(state.currentRun),
      saveWrites: window.__saveWrites,
    };
  });
}

test('Wall bump shows a visible cue without spending a turn or saving at 390x844 @smoke', async ({ page }, testInfo) => {
  await seedExplore(page);
  const panel = page.locator('#viewport-panel');
  const cue = page.locator('#move-blocked-cue');
  const before = await snapshot(page);

  await page.locator('#btn-move-forward').click();
  await expect(cue).toBeVisible();
  await expect(cue).toHaveText('壁に阻まれた');
  await expect(cue).toHaveAttribute('role', 'status');
  await expect(panel).toHaveAttribute('data-move-blocked', 'wall');
  await expect(panel).toHaveClass(/is-move-blocked/);
  const nudge = await page.locator('#dungeon-canvas').evaluate(element => getComputedStyle(element).animationName);
  expect(nudge).toBe('move-blocked-nudge');

  const box = await cue.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  await testInfo.attach('issue-1741-wall-390', { body: await page.screenshot({ path: testInfo.outputPath('issue-1741-wall-390.png') }), contentType: 'image/png' });

  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowUp');
  await expect(panel).toHaveAttribute('data-move-blocked-count', '5');
  const after = await snapshot(page);
  expect(after).toEqual({ ...before, saveWrites: 0 });

  // The cue is transient.
  await expect(cue).toBeHidden();
  await expect(panel).not.toHaveAttribute('data-move-blocked', /.*/);
});

test('One-way refusal keeps its log line and shows the same cue @smoke', async ({ page }) => {
  await seedExplore(page, { oneWay: true });
  const before = await snapshot(page);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#move-blocked-cue')).toHaveText('一方通行 ─ 進めない');
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-move-blocked', 'one-way');
  await expect(page.locator('#log-content')).toContainText('一方通行');
  const after = await snapshot(page);
  expect({ ...after, logs: before.logs }).toEqual({ ...before, saveWrites: 0 });
  expect(after.logs).toBe(before.logs + 1);
});

test('Reduced motion drops the nudge but keeps the text cue @smoke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedExplore(page);
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#move-blocked-cue')).toHaveText('壁に阻まれた');
  const nudge = await page.locator('#dungeon-canvas').evaluate(element => getComputedStyle(element).animationName);
  expect(nudge).toBe('none');
});
