import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 375, height: 667 };

// A 9x9 map whose start cell (4,4) is closed on every side, so pose changes
// come only from the test.
function makeDeadEndMap() {
  return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false],
    type: 'empty',
  })));
}

async function seedExplore(page) {
  await page.setViewportSize(VIEWPORT);
  await page.clock.install();
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async (map) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter, addLog } = await import('/src/state.js');
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
    addLog('地下1階に足を踏み入れた。石の通路が北へ続いている。');
    addLog('宝箱を開けた。回復薬を手に入れた！');
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    (await import('/src/renderer.js')).dungeonRenderer.draw();
  }, makeDeadEndMap());
  await expect(page.locator('#game-container')).toHaveAttribute('data-explore-hud', 'notice');
}

// Share of the dungeon view (the screen above the bottom action dock) that no
// upper HUD element covers, sampled on a 1px grid.
async function measureVisibleView(page) {
  await page.waitForFunction(() => document.getAnimations().every(animation => !(animation instanceof CSSTransition)));
  return page.evaluate(() => {
    const visible = (element) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || element.closest('[hidden]')) return null;
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? box : null;
    };
    const container = document.querySelector('#game-container');
    const banner = document.querySelector('#goal-banner');
    let goal = visible(banner);
    if (goal && container.dataset.goalExpanded === 'false') {
      const pillHeight = parseFloat(getComputedStyle(banner, '::before').height);
      goal = { left: goal.left, right: goal.right, top: goal.top + 6, bottom: goal.top + 6 + pillHeight };
    }
    const logContent = document.querySelector('#log-content');
    const log = logContent && logContent.children.length > 0
      ? visible(document.querySelector('#log-panel'))
      : visible(document.querySelector('#btn-log-expand'));
    const boxes = [
      visible(document.querySelector('#location-label')),
      visible(document.querySelector('#btn-mute')),
      goal,
      log,
      visible(document.querySelector('.hud-dir')),
      visible(document.querySelector('#dungeon-minimap-overlay')),
    ].filter(Boolean);
    const dock = document.querySelector('#controls-panel').getBoundingClientRect();
    const width = window.innerWidth;
    const height = Math.floor(dock.top);
    let covered = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (boxes.some(box => x + 0.5 >= box.left && x + 0.5 < box.right && y + 0.5 >= box.top && y + 0.5 < box.bottom)) covered++;
      }
    }
    return {
      visibleShare: 1 - covered / (width * height),
      hudBottom: Math.max(...boxes.filter(box => box.left < width / 2).map(box => box.bottom)),
    };
  });
}

test('Explore HUD leaves most of the dungeon view uncovered at 375x667 @smoke', async ({ page }, testInfo) => {
  await seedExplore(page);
  const container = page.locator('#game-container');

  // Goal, exploration rate, and quest progress share one folded line.
  await expect(container).toHaveAttribute('data-goal-expanded', 'false');
  await expect(page.locator('#goal-banner .goal-text')).toBeVisible();
  await expect(page.locator('#goal-banner .goal-stats-container')).toContainText('探索率');
  await expect(page.locator('#goal-banner .goal-feat-summary')).toHaveText('📜 偉業 B1F / B5F');
  await expect(page.locator('#goal-banner .feat-hud-list')).toBeHidden();

  // Just after an event, only the newest line is shown.
  const newest = page.locator('#log-content .event-strip-item');
  await expect(newest).toHaveCount(1);
  await expect(newest).toContainText('回復薬を手に入れた');
  const notice = await measureVisibleView(page);
  await testInfo.attach('issue-1832-notice-375x667', { body: await page.screenshot(), contentType: 'image/png' });

  // It clears after the linger time, leaving only the full-log entry point.
  await page.clock.runFor(4000);
  await expect(newest).toHaveCount(0);
  await expect(page.locator('#btn-log-expand')).toBeVisible();
  const quiet = await measureVisibleView(page);
  await testInfo.attach('issue-1832-quiet-375x667', { body: await page.screenshot(), contentType: 'image/png' });

  // Baseline before #1832 (same seed): 0.646 just after an event, 0.721 after two actions.
  console.log(`[issue-1832] visibleShare notice=${notice.visibleShare.toFixed(3)} quiet=${quiet.visibleShare.toFixed(3)} hudBottom notice=${notice.hudBottom} quiet=${quiet.hudBottom}`);
  expect(notice.visibleShare).toBeGreaterThanOrEqual(0.75);
  expect(quiet.visibleShare).toBeGreaterThanOrEqual(notice.visibleShare);

  // Unresolved observations (threats, traps) stay visible after the linger.
  await page.evaluate(async () => {
    const { addEventLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    addEventLog('【気配】壁の向こうで何かが動いた。', { key: 'hud-coverage-1832', scope: 'floor:1' });
    updateUI();
  });
  await page.clock.runFor(4000);
  await expect(page.locator('#log-content .event-strip-item--unresolved')).toContainText('【気配】');

  // The full goal and quest list are one tap away.
  await page.locator('#btn-goal-toggle').click();
  await expect(container).toHaveAttribute('data-goal-expanded', 'true');
  await expect(page.locator('#goal-banner .feat-hud-list')).toBeVisible();
  await expect(page.locator('#goal-banner .goal-feat-summary')).toBeHidden();
  await page.locator('#btn-log-expand').click();
  await expect(page.locator('#log-overlay-body')).toContainText('回復薬を手に入れた');
});
