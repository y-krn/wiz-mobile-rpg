import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };

// A 9x9 map whose start cell (4,4) is closed on every side, so forward input
// is a wall bump and pose changes come only from the test.
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
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async (map) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter, addEventLog, addLog } = await import('/src/state.js');
    const { assignRunQuests } = await import('/src/systems/run_quests.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    assignRunQuests(state.currentRun, () => 0);
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
    addEventLog('【気配】壁の向こうで何かが動いた。', { key: 'hud-focus-1765', scope: 'floor:1' });
    addLog('地下1階に足を踏み入れた。石の通路が北へ続いている。');
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    (await import('/src/renderer.js')).dungeonRenderer.draw();
  }, makeDeadEndMap());
  await expect(page.locator('#game-container')).toHaveAttribute('data-explore-hud', 'notice');
}

// Changes facing without the movement system, as a render-time action.
async function turn(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.dir = (state.dir + 1) % 4;
    updateUI();
  });
}

async function measureHud(page) {
  await page.waitForFunction(() => document.getAnimations().every(animation => !(animation instanceof CSSTransition)));
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === 'none') return null;
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const banner = document.querySelector('#goal-banner');
    const pillHeight = parseFloat(getComputedStyle(banner, '::before').height);
    const goal = rect('#goal-banner');
    const log = rect('#log-panel');
    const minimap = rect('#dungeon-minimap-overlay');
    const visibleGoal = document.querySelector('#game-container').dataset.goalExpanded === 'false'
      ? { ...goal, top: goal.top + 6, height: pillHeight }
      : goal;
    const area = [visibleGoal, log, minimap].reduce((sum, box) => sum + (box ? box.width * box.height : 0), 0);
    return {
      goal,
      pillHeight,
      log,
      minimap,
      area,
      lowestEdge: Math.max(...[visibleGoal, log, minimap].filter(Boolean).map(box => box.top + box.height)),
      goalToggle: rect('#btn-goal-toggle'),
      minimapToggle: rect('#btn-minimap-toggle'),
      logExpand: rect('#btn-log-expand'),
      compass: rect('.hud-dir'),
      // The issue's baseline: share of the upper half of the 3D view under HUD.
      upperCoverage: area / (window.innerWidth * window.innerHeight / 2),
    };
  });
}

test('Explore HUD folds after two actions and keeps active facts reachable at 390x844 @smoke', async ({ page }, testInfo) => {
  await seedExplore(page);
  const container = page.locator('#game-container');
  const goalToggle = page.locator('#btn-goal-toggle');
  const minimapToggle = page.locator('#btn-minimap-toggle');

  // Notice with the full-size minimap is the pre-#1765 layout.
  await minimapToggle.click();
  await expect(container).toHaveAttribute('data-minimap-size', 'full');
  const expanded = await measureHud(page);
  await minimapToggle.click();
  await expect(container).toHaveAttribute('data-minimap-size', 'compact');

  // A wall bump changes neither position nor facing and is not an action.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(container).toHaveAttribute('data-explore-hud', 'notice');

  await turn(page);
  await expect(container).toHaveAttribute('data-explore-hud', 'notice');
  await turn(page);
  await expect(container).toHaveAttribute('data-explore-hud', 'roam');
  await expect(container).toHaveAttribute('data-goal-expanded', 'false');

  const roam = await measureHud(page);
  expect(roam.pillHeight).toBeLessThanOrEqual(32);
  expect(expanded.upperCoverage).toBeGreaterThan(0.35);
  expect(roam.upperCoverage).toBeLessThanOrEqual(0.25);
  expect(roam.upperCoverage).toBeLessThanOrEqual(expanded.upperCoverage * 0.6);
  expect(roam.lowestEdge).toBeLessThanOrEqual(expanded.lowestEdge * 0.7);
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const [a, b] of [[roam.goal, roam.log], [roam.log, roam.compass], [roam.compass, roam.minimap], [roam.log, roam.minimap]]) {
    expect(overlaps(a, b)).toBe(false);
  }
  // The transparent minimap toggle tracks the compact card.
  expect(Math.abs(roam.minimapToggle.width - roam.minimap.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(roam.minimapToggle.top - roam.minimap.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(roam.minimapToggle.right - roam.minimap.right)).toBeLessThanOrEqual(1);
  for (const control of [roam.goalToggle, roam.minimapToggle, roam.logExpand]) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }

  // Folded facts stay visible: goal name, exploration rate, unresolved line, full-log entry point.
  await expect(page.locator('#goal-banner .goal-text')).toBeVisible();
  await expect(page.locator('#goal-banner .goal-stats-container')).toContainText('探索率');
  await expect(page.locator('#goal-banner .quest-hud-list')).toBeHidden();
  await expect(page.locator('#log-content .event-strip-item--unresolved')).toBeVisible();
  await expect(page.locator('#log-content .event-strip-item').last()).toBeVisible();
  await expect(page.locator('#btn-log-expand')).toBeVisible();
  const clamp = await page.locator('#log-content .event-strip-item--unresolved').evaluate(element => {
    const style = getComputedStyle(element);
    return { whiteSpace: style.whiteSpace, height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight) };
  });
  expect(clamp.whiteSpace).toBe('nowrap');
  expect(clamp.height).toBeLessThan(clamp.lineHeight * 1.5);

  await testInfo.attach('issue-1765-roam-390', { body: await page.screenshot({ path: testInfo.outputPath('issue-1765-roam-390.png') }), contentType: 'image/png' });

  // Goal detail and quota: one tap each way.
  await expect(goalToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(goalToggle).toHaveAttribute('aria-label', /^目標の詳細を表示/);
  await goalToggle.click();
  await expect(container).toHaveAttribute('data-goal-expanded', 'true');
  await expect(goalToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(goalToggle).toHaveAttribute('aria-label', /^目標の詳細を畳む/);
  await expect(page.locator('#goal-banner .quest-hud-list')).toBeVisible();
  // A manual expansion persists through roam.
  await turn(page);
  await expect(container).toHaveAttribute('data-explore-hud', 'roam');
  await expect(container).toHaveAttribute('data-goal-expanded', 'true');
  await goalToggle.click();
  await expect(goalToggle).toHaveAttribute('aria-expanded', 'false');

  // Minimap: one tap to 128px and back.
  await expect(minimapToggle).toHaveAttribute('aria-label', '地図を拡大');
  await minimapToggle.click();
  await expect(minimapToggle).toHaveAttribute('aria-label', '地図を縮小');
  await expect(minimapToggle).toHaveAttribute('aria-expanded', 'true');
  const full = await measureHud(page);
  expect(full.minimap.width).toBeCloseTo(128, 0);
  expect(full.minimapToggle.width).toBeCloseTo(128, 0);
  await minimapToggle.click();
  await expect(minimapToggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await measureHud(page)).minimap.width).toBeLessThan(90);

  // New information re-opens the HUD.
  await page.evaluate(async () => {
    const { addLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    addLog('床に古い足跡が残っている。');
    updateUI();
  });
  await expect(container).toHaveAttribute('data-explore-hud', 'notice');
  await expect(container).toHaveAttribute('data-goal-expanded', 'true');
});

test('Explore HUD focus leaves combat and town layouts unchanged @smoke', async ({ page }) => {
  await seedExplore(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'combat';
    state.combatState = { phase: 'choose_actions', monsters: [{ name: '検証敵', level: 1, hp: 100, maxHp: 100, magicResist: 0, color: '#00e5ff', spriteType: 'biter' }] };
    updateUI();
  });
  const container = page.locator('#game-container');
  await expect(container).toHaveAttribute('data-dungeon-first-state', 'combat');
  await expect(container).not.toHaveAttribute('data-explore-hud', /.*/);
  await expect(container).not.toHaveAttribute('data-minimap-size', /.*/);
  await expect(page.locator('#btn-minimap-toggle')).toBeHidden();
  await expect(page.locator('#btn-goal-toggle')).toHaveCount(0);
  const transform = await page.locator('#dungeon-minimap-overlay').evaluate(element => getComputedStyle(element).transform);
  expect(transform).toBe('none');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'town';
    state.combatState = null;
    updateUI();
  });
  await expect(container).not.toHaveAttribute('data-explore-hud', /.*/);
  await expect(page.locator('#btn-goal-toggle')).toHaveCount(0);
});

test('Explore HUD switches instantly under reduced motion @smoke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedExplore(page);
  const durations = await page.evaluate(() => ['#goal-banner', '#dungeon-minimap-overlay', '#btn-minimap-toggle']
    .map(selector => getComputedStyle(document.querySelector(selector)).transitionDuration));
  for (const duration of durations) expect(duration.split(',').every(value => parseFloat(value) === 0)).toBe(true);
});
