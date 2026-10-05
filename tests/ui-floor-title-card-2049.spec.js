import { test, expect } from './fixtures/browser-health.js';

// The floor title card (#2049) takes the place of the goal and the event
// strip while it is up: each of them is either wholly under the card or clear
// of it, never half covered.

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 375, height: 667 }, { width: 320, height: 568 }];

async function arrive(page, viewport, floor) {
  await page.setViewportSize(viewport);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ floor }) => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter, addLog } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { updateUI, showFloorEntryStinger } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'title-card-2049';
    state.currentRun.startingKit = 'vanguard';
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = floor;
    state._freshRunFloor = floor;
    ensureRunFloor(state, floor);
    state.dungeonMemory = { mapFragments: {}, visitedFloors: Array.from({ length: floor }, (_, index) => index + 1) };
    state.repelTurns = 999;
    state.gameState = 'explore';
    state.transitioning = false;
    state.logs = [];
    addLog('冷たい空気が、石の階段を這い上がってくる。');
    updateUI();
    showFloorEntryStinger(floor, true);
  }, { floor });
  const card = page.locator('#floor-entry-stinger');
  await expect(card).toHaveClass(/visible/);
  // Wait for the slide-in to settle before measuring.
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).opacity)).toBe('1');
  await expect.poll(() => card.evaluate(element => new DOMMatrix(getComputedStyle(element).transform).m42)).toBe(0);
}

const measure = page => page.evaluate(() => {
  const box = selector => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
  };
  const banner = document.querySelector('#goal-banner');
  // The folded goal is a 44px hit area around a pill drawn by ::before.
  const goal = box('#goal-banner');
  if (document.querySelector('#game-container').dataset.goalExpanded === 'false') {
    const pill = getComputedStyle(banner, '::before');
    goal.top += parseFloat(pill.top);
    goal.bottom = goal.top + parseFloat(pill.height);
  }
  return { card: box('#floor-entry-stinger'), goal, strip: box('#log-panel'), width: window.innerWidth };
});

for (const viewport of VIEWPORTS) {
  for (const floor of [2, 5]) {
    test(`The floor title card covers the goal and the event strip whole on B${floor}F at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
      await arrive(page, viewport, floor);
      const { card, goal, strip, width } = await measure(page);
      for (const [name, row] of [['goal', goal], ['event strip', strip]]) {
        const clear = row.top >= card.bottom || row.bottom <= card.top;
        const covered = row.top >= card.top - 0.5 && row.bottom <= card.bottom + 0.5
          && row.left >= card.left - 0.5 && row.right <= card.right + 0.5;
        expect(clear || covered, `${name} ${JSON.stringify(row)} under card ${JSON.stringify(card)}`).toBe(true);
      }
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(width);
      // Nothing shows through the card while it covers them.
      const alpha = await page.locator('#floor-entry-stinger')
        .evaluate(element => getComputedStyle(element).backgroundColor);
      expect(alpha).toMatch(/^rgb\(/);
      await testInfo.attach(`issue-2049-B${floor}F-${viewport.width}x${viewport.height}`, {
        body: await page.screenshot(), contentType: 'image/png',
      });
    });
  }
}

test('The floor title card leaves the explore screen as it was once it is gone', async ({ page }) => {
  await arrive(page, VIEWPORTS[0], 2);
  const before = await measure(page);
  await expect(page.locator('#floor-entry-stinger')).not.toHaveClass(/visible/, { timeout: 4000 });
  const after = await measure(page);
  expect(after.goal).toEqual(before.goal);
  expect(after.strip.top).toBe(before.strip.top);
});
