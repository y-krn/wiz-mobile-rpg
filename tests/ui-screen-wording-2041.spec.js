import { test, expect } from './fixtures/browser-health.js';

// Town, departure, result and workshop wording after the 2026-10 screen
// audit (#2041): only what applies is listed, in plain words.

async function openTown(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#town-controls')).toBeVisible();
}

async function openPreparation(page, kitId) {
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.party = [];
    state.gameState = 'town';
    openSubmenu('solo_start', '開始キットを選ぶ：冒険はいつもLv1から');
  });
  await page.locator(`[data-kit-id="${kitId}"]`).click();
  await page.locator('#btn-kit-confirm').click();
  return page.locator('.solo-preparation-summary');
}

test('The departure summary lists only what applies to the chosen kit', async ({ page }) => {
  await openTown(page);

  const fighter = await openPreparation(page, 'vanguard');
  await expect(fighter).toContainText('今回の支度');
  await expect(fighter).toContainText('身につける品');
  // With one dungeon open, it is already chosen.
  await expect(fighter.locator('.solo-preparation-floor')).toContainText('行き先崩れた坑道');
  await expect(fighter.locator('.solo-preparation-medium')).toHaveCount(0);
  await expect(fighter.locator('.solo-preparation-runes')).toHaveCount(0);
  const fighterText = await fighter.textContent();
  expect(fighterText).not.toMatch(/バッグ外|出発クラフト|出発条件|ルーン枠 0|なし/);

  // A kit that casts shows its medium and the rune it starts with.
  const caster = await openPreparation(page, 'arcana');
  await expect(caster.locator('.solo-preparation-medium')).toContainText(/呪文の媒体.+（ルーン枠 \d+）/);
  await expect(caster.locator('.solo-preparation-runes')).toContainText('使うルーン');
});

test('The result says how much came home and names records in plain words', async ({ page }) => {
  await openTown(page);
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'gameover';
    run.outcome = 'death';
    run.deepestFloor = 2;
    run.materialsBeforeBanking = { '獣の牙': 7, '鉄片': 3 };
    run.bankedMaterials = { '獣の牙': 2 };
    run.codexRewards = { '霊粉': 1 };
    run.codexDiscoveries = ['ゴブリン'];
    run.recordResult = { updated: true, updates: ['死亡最深', '最深到達記録', '最多撃破記録', '最多宝箱記録'], depth: 2 };
    run.quests = [];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    state.gameState = 'result';
    updateUI();
  });

  const result = page.locator('#result-overlay');
  await expect(result.locator('.result-record-kicker')).toHaveText('最深記録を更新');
  await expect(result.locator('.result-record-new small')).toHaveText('倒した数・開けた宝箱も過去最多');
  await expect(result.locator('#result-material-title')).toHaveText('素材10個のうち2個を持ち帰った');
  await expect(result.locator('.result-banking-rate')).toHaveText('死亡では、種類ごとに3割だけが街に届く（端数は切り捨て）。');
  await expect(result).toContainText('初めて倒した魔物の報酬');
  await expect(result).toContainText('書庫に新しい記録: ゴブリン');
  const text = await result.textContent();
  expect(text).not.toMatch(/NEW DEPTH RECORD|ADVENTURE RECORD|Codex|メタ報酬|素材収支|潜行|能力値への効果なし|記録 \/ /);
});

test('The workshop says what each shelf adds, without internal terms', async ({ page }) => {
  await openTown(page);
  await page.locator('#btn-town-workshop').click();
  await expect(page.locator('#submenu-title')).toHaveText('工房');
  const options = page.locator('#submenu-options');
  await expect(options.locator('.workshop-purpose')).toContainText('次の冒険で選べるものを増やす');
  await expect(options.locator('.workshop-category').first()).toHaveText('開始武器');
  await expect(options).toContainText('迷宮で見つかる品');
  await expect(options).toContainText('30〜60ダメージ');
  const text = await options.textContent();
  expect(text).not.toMatch(/候補|DMG|潜行|最適/);
});

test('The town home names its sections in plain words', async ({ page }) => {
  await openTown(page);
  const home = page.locator('[data-town-home]');
  await expect(home).toContainText('次の冒険');
  await expect(home).toContainText('これまでの蓄え');
  await expect(page.locator('#btn-town-workshop')).toHaveText('工房次の冒険で選べるものを増やす');
  await expect(page.locator('#btn-town-archives')).toHaveText('迷宮について分かったこと書庫');
  await expect(page.locator('#records-strip')).toContainText('冒険の数');
  const text = await home.textContent();
  expect(text).not.toMatch(/潜行|Codex|Workshop|可能性/);
});
