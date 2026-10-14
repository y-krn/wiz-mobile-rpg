import { test, expect } from './fixtures/browser-health.js';

// Exploration recovery (#1993, rest since #2114): the floor's allowance is
// shown on the HP/MP bars, in the unfolded goal, and on the stairs menu,
// without taking width from the folded goal pill.

// A 9x9 map with one corridor running north from the start cell (4,4).
function makeCorridorMap() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false],
    type: 'empty',
  })));
  for (let y = 4; y > 1; y--) {
    map[y][4].walls[0] = false;
    map[y - 1][4].walls[2] = false;
  }
  return map;
}

async function seedExplore(page, { viewport = { width: 375, height: 667 }, kit = 'vanguard', hp = 40, mp = null } = {}) {
  await page.setViewportSize(viewport);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ map, kit, hp, mp }) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const hero = createStartingKitCharacter(kit);
    hero.maxHp = 100;
    hero.hp = hp;
    if (mp !== null) hero.mp = mp;
    state.party = [hero];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row, y) => row.map((_, x) => x === 4 && y === 4));
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.roamingMonsters = [];
    state.repelTurns = 999;
    state.encounterQuietSteps = 99;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.logs = [];
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    (await import('/src/renderer.js')).dungeonRenderer.draw();
  }, { map: makeCorridorMap(), kit, hp, mp });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator('#game-container')).toHaveAttribute('data-goal-expanded', 'false');
}

async function stepForward(page) {
  await page.evaluate(async () => {
    const { handleMove } = await import('/src/movement.js');
    handleMove('forward');
  });
}

const heroHp = page => page.evaluate(async () => (await import('/src/state.js')).state.party[0].hp);

async function rest(page) {
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { restExploration } = await import('/src/movement.js');
    state.transitioning = false;
    restExploration();
  });
}

test('Walking no longer heals; resting does, and the bars, goal, and stairs menu show what is left @smoke', async ({ page }) => {
  await seedExplore(page);
  const hpRow = page.locator('#character-hud .hp-row');
  const recoveryStat = page.locator('.goal-recovery-stat');

  // Max HP 100: the floor allowance is 60% of the bar (#2114), held to the 60 missing.
  await expect(hpRow).toHaveAttribute('data-recovery-reserve', '60');
  await expect(hpRow.locator('.bar-reserve.hp')).toBeVisible();
  await expect(recoveryStat).toBeHidden();

  // A newly visited cell gives nothing back.
  await stepForward(page);
  await expect.poll(() => page.evaluate(async () => (await import('/src/state.js')).state.y)).toBe(3);
  expect(await heroHp(page)).toBe(40);

  // A full rest (10 turns at 3% of 100) gives back 30, from the allowance.
  await rest(page);
  await expect.poll(() => heroHp(page)).toBe(70);
  await expect(hpRow.locator('.bar-value')).toHaveText('70/100');
  await expect(hpRow).toHaveAttribute('data-recovery-reserve', '30');
  await expect(hpRow).toContainText('この階で休めば、あと30回復できる');

  // The unfolded goal names the allowance; vanguard's single MP earns none.
  await page.locator('#btn-goal-toggle').click();
  await expect(recoveryStat).toBeVisible();
  await expect(recoveryStat).toHaveText('♨️ 休んで回復 あとHP 30');

  // The stairs menu says what the floor can still give before descending.
  await page.evaluate(async () => {
    const { openSubmenu } = await import('/src/navigation.js');
    openSubmenu('stairs_down', 'B2Fへの下り階段');
  });
  const note = page.getByTestId('stairs-recovery-note');
  await expect(note).toBeVisible();
  await expect(note).toHaveText('この階で休めば、あとHP 30回復できる。 階段を降りても回復はしない。');
});

test('Rest is offered in the adventure menu with what it can still give', async ({ page }) => {
  await seedExplore(page);
  await page.evaluate(async () => {
    const { openSubmenu } = await import('/src/navigation.js');
    openSubmenu('explore_management', '冒険管理');
  });
  const restButton = page.locator('#btn-rest');
  await expect(restButton).toBeEnabled();
  await expect(restButton).toContainText('あとHP 60');
  await restButton.click();
  await expect.poll(() => heroHp(page)).toBe(70);
});

test('The bars hold the reserve to what is missing, and poison suspends it', async ({ page }) => {
  await seedExplore(page, { kit: 'arcana', hp: 97, mp: 0 });
  const hpRow = page.locator('#character-hud .hp-row');
  const mpRow = page.locator('#character-hud .mp-row');
  // 3 HP missing of a 100 allowance; arcana's 3 MP gives a 1 MP allowance.
  await expect(hpRow).toHaveAttribute('data-recovery-reserve', '3');
  await expect(mpRow).toHaveAttribute('data-recovery-reserve', '1');
  await page.locator('#btn-goal-toggle').click();
  await expect(page.locator('.goal-recovery-stat')).toHaveText('♨️ 休んで回復 あとHP 60・MP 1');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party[0].status = 'poisoned';
    updateUI();
  });
  await expect(page.locator('.goal-recovery-stat')).toHaveText('♨️ 休んで回復 毒で止まっている');
  await expect(hpRow.locator('.bar-reserve')).toHaveCount(0);
  await expect(mpRow.locator('.bar-reserve')).toHaveCount(0);
  // Poison bites on some steps at random; hold the roll so this step shows
  // only that recovery is suspended.
  await page.evaluate(() => { window.__realRandom = Math.random; Math.random = () => 0.99; });
  await stepForward(page);
  await expect.poll(() => page.evaluate(async () => (await import('/src/state.js')).state.y)).toBe(3);
  expect(await heroHp(page)).toBe(97);
  await page.evaluate(() => { Math.random = window.__realRandom; });

  // Full HP and MP: nothing to show on the bars or the stairs menu.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getCharMaxMp } = await import('/src/data.js');
    const { openSubmenu } = await import('/src/navigation.js');
    const hero = state.party[0];
    hero.status = 'ok';
    hero.hp = 100;
    hero.mp = getCharMaxMp(hero);
    state.transitioning = false;
    openSubmenu('stairs_down', 'B2Fへの下り階段');
  });
  await expect(page.getByRole('button', { name: /へ降りる$/ })).toBeVisible();
  await expect(page.getByTestId('stairs-recovery-note')).toHaveCount(0);
  await expect(hpRow.locator('.bar-reserve')).toHaveCount(0);
});

for (const width of [320, 360, 390]) {
  test(`The recovery allowance costs the folded goal no width and fits the unfolded goal at ${width}px`, async ({ page }) => {
    await seedExplore(page, { viewport: { width, height: 640 }, kit: 'arcana', hp: 10, mp: 0 });
    const measure = () => page.evaluate(async () => {
      // Unfolding introduces new glyphs and can load another web-font subset.
      document.querySelector('#goal-banner').getBoundingClientRect();
      await document.fonts.ready;
      const box = selector => document.querySelector(selector)?.getBoundingClientRect();
      const stat = document.querySelector('.goal-recovery-stat');
      return {
        goalWidth: box('.goal-text').width,
        bannerHeight: box('#goal-banner').height,
        rowHeight: box('.goal-row').height,
        featListHeight: box('#goal-banner .feat-hud-list')?.height ?? 0,
        statClipped: stat ? stat.scrollWidth > stat.clientWidth : false,
      };
    });

    const folded = await measure();
    await page.evaluate(() => document.querySelector('.goal-recovery-stat').remove());
    expect((await measure()).goalWidth).toBe(folded.goalWidth);
    expect(folded.goalWidth).toBeGreaterThanOrEqual(110);

    // Unfolded, with the exploration rate at its widest (three digits).
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.visitedMaps[0] = state.visitedMaps[0].map(row => row.map(() => true));
      updateUI();
    });
    await page.locator('#btn-goal-toggle').click();
    const stat = page.locator('.goal-recovery-stat');
    await expect(stat).toBeVisible();
    await expect(page.locator('.goal-stats-container')).toContainText('探索率: 100%');
    await expect(stat).toContainText('あとHP 60・MP 1');
    await page.waitForFunction(() => document.getAnimations().every(animation => !(animation instanceof CSSTransition)));
    const unfolded = await measure();
    expect(unfolded.statClipped).toBe(false);
    expect(unfolded.featListHeight).toBeGreaterThan(0);
    // The allowance sits on the exploration-rate line: without it the goal
    // row and the whole unfolded goal are exactly as tall.
    await page.evaluate(() => document.querySelector('.goal-recovery-stat').remove());
    const baseline = await measure();
    expect(unfolded.rowHeight).toBe(baseline.rowHeight);
    expect(unfolded.bannerHeight).toBe(baseline.bannerHeight);
  });
}
