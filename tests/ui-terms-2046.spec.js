import { test, expect } from './fixtures/browser-health.js';

// Player-facing terms (#2046, .agents/glossary.md): screens are in Japanese,
// spells and the town carry their own names, and only three tags open a log
// line.

async function seedExplore(page, { kit = 'arcana' } = {}) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ kit }) => {
    const { state, initNewGame, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { ensureRunFloor } = await import('/src/state/run_floor_state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.party = [createStartingKitCharacter(kit)];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'terms-2046';
    state.currentRun.startingKit = kit;
    state.maps = [];
    state.visitedMaps = [];
    state.roamingMonsters = [];
    state.floor = 1;
    state._freshRunFloor = 1;
    ensureRunFloor(state, 1);
    state.repelTurns = 0;
    state.gameState = 'explore';
    state.transitioning = false;
    state.logs = [];
    updateUI();
  }, { kit });
}

// English that is allowed to stay on screen.
const ALLOWED = /DEPTHWARD|HP|MP|Lv|ON|OFF/g;
const latinWords = text => (text.replace(ALLOWED, '').match(/[A-Za-z]{3,}/g) || []);

test('The town carries its own name and shows no English label', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    initNewGame();
    state.gameState = 'town';
    (await import('/src/ui.js')).updateUI();
  });
  await expect(page.locator('#location-label')).toHaveText('坑口の街');
  expect(latinWords(await page.locator('#game-container').innerText())).toEqual([]);
});

test('Explore names light, repel, and conditions in Japanese', async ({ page }) => {
  await seedExplore(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    Object.assign(state, { lightPower: 'milwa', lightTurns: 12, repelTurns: 5 });
    state.party[0].status = 'poisoned';
    (await import('/src/ui.js')).updateUI();
  });
  const location = page.locator('#location-label');
  await expect(location).toContainText('(灯り:12)');
  await expect(location).toContainText('(魔物よけ:5)');
  await expect(page.locator('#character-hud .character-status')).toHaveText('毒');
  expect(latinWords(await page.locator('#game-container').innerText())).toEqual([]);

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    state.lightPower = 'lomilwa';
    (await import('/src/ui.js')).updateUI();
  });
  await expect(location).toContainText('(大灯り:12)');
});

test('Only 【気配】【痕跡】【予兆】 open a log line', async ({ page }) => {
  await seedExplore(page);
  const stored = await page.evaluate(async () => {
    const { state, addLog, addEventLog } = await import('/src/state.js');
    addLog('[味方] [!] 冒険者は毒に侵された。');
    addLog('[警告] 竜が大きく息を吸い込んだ！');
    addLog('【解除成功】罠の仕掛けを止めた。');
    addEventLog('【気配】北の方から、ただならぬ気配がする…', { key: 'terms-2046-aura', scope: 'floor:1' });
    (await import('/src/ui.js')).updateUI();
    return {
      logs: state.logs.map(entry => String(entry?.text ?? entry)),
      observation: state.currentRun.eventObservations['terms-2046-aura'].text,
    };
  });
  expect(stored.logs).toEqual([
    '冒険者は毒に侵された。',
    '【予兆】竜が大きく息を吸い込んだ！',
    '罠の仕掛けを止めた。',
    '【気配】北の方から、ただならぬ気配がする…',
  ]);
  expect(stored.observation).toBe('【気配】北の方から、ただならぬ気配がする…');

  await page.locator('#btn-log-expand').click();
  const overlay = page.locator('#log-overlay-body');
  await expect(overlay).toContainText('【予兆】竜が大きく息を吸い込んだ！');
  const text = await overlay.textContent();
  expect(text).not.toMatch(/\[味方\]|\[!\]|\[警告\]|【解除成功】/);
});

test('A spell is shown and logged under its own name', async ({ page }) => {
  await seedExplore(page);
  const shown = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { getItemData } = await import('/src/data.js');
    const { SPELL_EFFECTS } = await import('/src/systems/spell_effects.js');
    const hero = state.party[0];
    const cast = SPELL_EFFECTS.HALITO({ caster: hero, target: { name: 'コボルト', hp: 30 }, rng: () => 0.5 });
    return {
      rune: getItemData('RUNE_HALITO').name,
      runeDesc: getItemData('RUNE_HALITO').desc,
      log: cast.log,
    };
  });
  expect(shown.rune).toBe('火矢のルーン');
  expect(shown.runeDesc).toBe('火矢の呪文を媒体に刻む一枚のルーン。');
  expect(shown.log).toContain('冒険者は火矢を唱えた！');
  expect(latinWords(shown.log)).toEqual([]);
});
