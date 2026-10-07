import { test, expect } from './fixtures/browser-health.js';

// Feats, walking recovery, and equipment families after the 2026-10 screen
// audit (#2044): the folded goal reads without a legend, the unfolded list
// never cuts an entry in half, and each word says what it is for.

async function seedExplore(page, { width = 390, companions = [], fragments = 0, oath = false, announced = [] } = {}) {
  await page.setViewportSize({ width, height: 700 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ companions, fragments, oath, announced }) => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'feats-wording-2044';
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.companions = companions;
    state.currentRun.guideFragments = fragments;
    state.currentRun.oath = oath;
    state.currentRun.featsAnnounced = announced;
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = 1;
    state._freshRunFloor = 1;
    ensureRunFloor(state, 1);
    state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
    state.repelTurns = 999;
    state.gameState = 'explore';
    state.transitioning = false;
    state.logs = [];
    updateUI();
  }, { companions, fragments, oath, announced });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator('#game-container')).toHaveAttribute('data-goal-expanded', 'false');
}

const foldedGoal = page => page.evaluate(() => {
  const goal = document.querySelector('#goal-banner .goal-text');
  const shown = element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  return {
    clipped: goal.scrollWidth > goal.clientWidth,
    labelShown: shown(goal.querySelector('.goal-label')),
    chips: [...document.querySelectorAll('#goal-banner .goal-feat-summary')].filter(shown).map(chip => chip.textContent),
  };
});

for (const width of [390, 360]) {
  test(`The folded goal shows the whole sentence and names one feat at ${width}px`, async ({ page }) => {
    await seedExplore(page, { width });
    await expect(page.locator('#goal-banner .goal-text')).toHaveText('🎯 目標: 階段を探して地下2階へ');
    const folded = await foldedGoal(page);
    expect(folded.clipped).toBe(false);
    expect(folded.labelShown).toBe(false);
    // The feat is named; a bare "B1F / B5F" said nothing about what it counts.
    expect(folded.chips).toHaveLength(1);
    expect(folded.chips[0]).toMatch(/^📜 偉業 \S+/);
    expect(folded.chips[0]).not.toMatch(/\d/);
  });
}

test('At 320px the folded goal keeps the whole line for the sentence', async ({ page }) => {
  await seedExplore(page, { width: 320 });
  const folded = await foldedGoal(page);
  expect(folded.clipped).toBe(false);
  expect(folded.chips).toEqual([]);
  await expect(page.locator('#goal-banner .goal-stats-container')).toContainText('%');
});

test('With someone to lead out, the folded goal names them and nothing else', async ({ page }) => {
  await seedExplore(page, { companions: ['foreman'], fragments: 2 });
  const folded = await foldedGoal(page);
  expect(folded.chips).toEqual(['👤 同行 鉱夫頭']);
  expect(folded.clipped).toBe(false);
});

test('The unfolded goal lists at most four entries and cuts none of them', async ({ page }) => {
  await seedExplore(page, { companions: ['foreman'], fragments: 2, oath: true, announced: ['chests_30'] });
  await page.locator('#btn-goal-toggle').click();
  await expect(page.locator('#game-container')).toHaveAttribute('data-goal-expanded', 'true');
  await expect(page.locator('#goal-banner .goal-label')).toBeVisible();

  await page.waitForFunction(() => document.getAnimations().every(animation => !(animation instanceof CSSTransition)));
  const list = await page.evaluate(async () => {
    document.querySelector('#goal-banner').getBoundingClientRect();
    await document.fonts.ready;
    const element = document.querySelector('#goal-banner .feat-hud-list');
    const banner = document.querySelector('#goal-banner').getBoundingClientRect();
    return {
      entries: [...element.children].map(item => ({
        name: item.querySelector('strong').textContent,
        progress: item.querySelector('small').textContent,
        nameClipped: item.querySelector('strong').scrollWidth > item.querySelector('strong').clientWidth,
        inside: item.getBoundingClientRect().bottom <= banner.bottom + 0.5,
      })),
      scrolls: element.scrollHeight > element.clientHeight,
    };
  });
  expect(list.entries.map(entry => `${entry.name}｜${entry.progress}`).slice(0, 3)).toEqual([
    '同行：鉱夫頭｜生還で救出',
    '誓約｜死ねば素材は残らない',
    '断片 2枚｜生還で持ち帰る',
  ]);
  expect(list.entries).toHaveLength(4);
  // What is still ahead outranks what this run already achieved.
  expect(list.entries[3].progress).toMatch(/^\S+\/\S+$/);
  expect(list.entries.filter(entry => entry.nameClipped || !entry.inside)).toEqual([]);
  expect(list.scrolls).toBe(false);
});

test('The equipment screen says what a family is for', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { openEquipOverlay } = await import('/src/equip_ui.js');
    const { createDepartureCharacter } = await import('/src/systems/departure_preparation.js');
    initNewGame();
    state.party = [createDepartureCharacter('vanguard').character];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.startingKit = 'vanguard';
    state.floor = 1;
    state.gameState = 'explore';
    updateUI();
    openEquipOverlay(0);
  });
  const strip = page.locator('[data-testid="equipment-sets"]');
  await expect(strip.locator('.equip-set-strip-label')).toHaveText('系統（3つそろえると効果）');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
