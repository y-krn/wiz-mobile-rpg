import { test, expect } from '@playwright/test';
import { VIEWPORTS, SOLO_HUD_VIEWPORTS, SOLO_HUD_STATES } from './ui-ux-helpers.js';
test('Debug reset clears all progression and persists the initial state', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { saveAutosave, state } = await import('/src/state.js');
    state.inventory = ['HEAL_POTION', 'ANTIGRAVITY_CRYSTAL'];
    state.records.totalRuns = 9;
    state.codex.monsters.GOBLIN = { killed: 4 };
    state.dungeonMemory.visitedFloors = [1, 2, 3];
    state.metaMaterials = { '鉄片': 12 };
    state.workshop = { ranks: { gear_rapier: 2 } };
    saveAutosave();
  });

  await page.locator('#btn-town-castle').click();
  const resetButton = page.getByRole('button', { name: 'デバッグ: データ全初期化' });
  await expect(resetButton).toBeVisible();

  page.once('dialog', dialog => dialog.dismiss());
  await resetButton.click();
  expect(await page.evaluate(async () => (await import('/src/state.js')).state.records.totalRuns)).toBe(9);

  page.once('dialog', dialog => dialog.accept());
  await resetButton.click();
  await expect(page.locator('#town-controls')).toBeVisible();
  await expect(page.locator('#log-content')).toContainText('クラスを選び、ひとりで迷宮へ潜ろう。');

  const readProgress = () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      inventory: state.inventory,
      totalRuns: state.records.totalRuns,
      monsterKills: state.codex.monsters.GOBLIN?.killed || 0,
      visitedFloors: state.dungeonMemory.visitedFloors,
      metaMaterials: state.metaMaterials,
      workshopRanks: state.workshop.ranks,
    };
  });
  const initialProgress = {
    inventory: [],
    totalRuns: 0,
    monsterKills: 0,
    visitedFloors: [1],
    metaMaterials: {},
    workshopRanks: {},
  };
  expect(await readProgress()).toEqual(initialProgress);

  await page.reload();
  expect(await readProgress()).toEqual(initialProgress);
});

for (const vp of VIEWPORTS) {
  test(`Records, run quests, and result focus stay visible at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.gameState = 'town';
      state.currentRun = null;
      state.records = {
        deepestRetreat: 12,
        deepestDeath: 9,
        deepestByClass: { Mage: 12 },
        totalRuns: 7,
      };
      updateUI();
    });

    const recordsStrip = page.locator('#records-strip');
    await expect(recordsStrip).toBeVisible();
    await expect(recordsStrip).toContainText('撤退最深');
    await expect(recordsStrip).toContainText('B12F');
    await expect(recordsStrip).toContainText('死亡最深');
    const titleBox = await recordsStrip.boundingBox();
    expect(titleBox.x).toBeGreaterThanOrEqual(0);
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(vp.width);

    await page.evaluate(async () => {
      const { createDefaultCurrentRun, createSoloCharacter, state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.party = [createSoloCharacter('Mage')];
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.deepestFloor = 6;
      state.currentRun.quests = [{
        id: 'depth:1:5', templateId: 'reach_milestone', type: 'depth', name: '次の深みへ',
        description: '次の階層守護者が待つ階まで到達する。', targetValue: 5, currentValue: 5,
        completed: true, rewardClaimed: true, reward: { materials: { '鉄片': 3 } },
      }];
      state.gameState = 'explore';
      updateUI();
    });
    const questHud = page.locator('.quest-hud-list');
    await expect(questHud.getByText('次の深みへ')).toBeVisible();
    await expect(questHud.getByText('達成')).toBeVisible();
    await expect(page.locator('#btn-run-quests')).toHaveCount(0);
    const questHudBox = await questHud.boundingBox();
    expect(questHudBox.x).toBeGreaterThanOrEqual(0);
    expect(questHudBox.x + questHudBox.width).toBeLessThanOrEqual(vp.width);

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      const run = state.currentRun;
      run.returnReason = 'milestone_portal';
      run.deepestFloor = 13;
      run.materialsBeforeBanking = { '獣の牙': 5, '鉄片': 3 };
      run.bankedMaterials = { '獣の牙': 5, '鉄片': 3 };
      run.codexRewards = { '霊粉': 1 };
      run.recordResult = { updated: true, updates: ['撤退最深', 'Mage最深'], depth: 13 };
      state.gameState = 'result';
      updateUI();
    });

    const result = page.locator('#result-overlay');
    await expect(result).toBeVisible();
    await expect(result).toContainText('今回の深度 B13F');
    await expect(result).toContainText('NEW DEPTH RECORD');
    await expect(result).toContainText('素材収支');
    await expect(result).toContainText('ランクエスト');
    const button = page.locator('#btn-result-castle');
    const buttonBox = await button.boundingBox();
    expect(buttonBox.height).toBeGreaterThanOrEqual(44);
    expect(buttonBox.y).toBeGreaterThan(vp.height * 0.5);
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(vp.height);
  });
}

for (const vp of VIEWPORTS) {
  test(`Floor identity fits ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { showFloorEntryStinger, updateUI } = await import('/src/ui.js');
      state.gameState = 'explore';
      state.currentRun = { floorsVisited: [1], deepestFloor: 1 };
      state.floor = 1;
      state.dungeonMemory = { mapFragments: {}, visitedFloors: [1] };
      updateUI();
      showFloorEntryStinger(16, true);
    });

    await expect(page.locator('#location-label')).toContainText('崩れた坑道');
    await expect(page.locator('#goal-banner')).toContainText('???（地下2階）');
    const stinger = page.locator('#floor-entry-stinger');
    await expect(stinger).toBeVisible();
    await expect(stinger).toContainText('水没した魔導書庫');
    const box = await stinger.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  });
}

for (const vp of SOLO_HUD_VIEWPORTS) {
  test.describe(`Solo HUD on ${vp.name} (${vp.width}x${vp.height})`, () => {
    for (const gameState of SOLO_HUD_STATES) {
      test(`shows one Mage with visible MP in ${gameState}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto('/');
        if (vp.safeArea) {
          await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });
        }
        await page.evaluate(async (nextGameState) => {
          const { state, createSoloCharacter } = await import('/src/state.js');
          const { menuContext } = await import('/src/navigation.js');
          const { updateUI } = await import('/src/ui.js');
          state.party = [createSoloCharacter('Mage')];
          state.gameState = nextGameState;
          state.combatState = { phase: 'choose_actions', monsters: [], playerActions: [] };
          menuContext.type = nextGameState === 'submenu' ? 'item_inventory' : '';
          menuContext.prevGameState = 'explore';
          updateUI();
        }, gameState);

        const hud = await page.evaluate(() => {
          const panel = document.querySelector('#character-panel').getBoundingClientRect();
          const cards = Array.from(document.querySelectorAll('#character-hud .character-card'));
          const mpRow = cards[0].querySelector('.mp-row');
          return {
            panel: panel.toJSON(),
            cards: cards.map(card => card.getBoundingClientRect().toJSON()),
            mpHidden: mpRow.hidden,
            mpText: mpRow.querySelector('.bar-value').textContent,
          };
        });
        expect(hud.cards).toHaveLength(1);
        expect(hud.mpHidden).toBe(false);
        expect(hud.mpText).toMatch(/\d+\/\d+/);
        expect(hud.cards[0].bottom).toBeLessThanOrEqual(hud.panel.bottom + 0.5);
        expect(hud.panel.bottom).toBeLessThanOrEqual(vp.height - (vp.safeArea ? 34 : 0));
      });
    }
  });
}
