import { test, expect } from './fixtures/browser-health.js';

test('Result leads with run memory and keeps loot ownership explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createSoloCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'milestone_portal';
    run.outcome = 'retreat';
    run.deepestFloor = 5;
    run.characterClass = 'Fighter';
    run.itemsFound = ['HEAL_POTION'];
    run.equipmentFound = [{ kind: 'equipment', baseId: 'SHORT_SWORD', identified: false, unidentifiedName: '未鑑定の短剣' }];
    run.returnedTownItems = ['TRAP_KIT'];
    run.departureItems = ['TRAP_KIT'];
    run.codexDiscoveries = ['ゴブリン'];
    run.workshopDiscoveries = ['FORGE_SEAL'];
    run.materialsBeforeBanking = { '獣の牙': 8 };
    run.bankedMaterials = { '獣の牙': 8 };
    run.recordResult = { updated: true, updates: ['最深到達記録'], depth: 5 };
    run.quests = [];
    state.party = [createSoloCharacter('Fighter')];
    state.currentRun = run;
    state.gameState = 'result';
    updateUI();
  });

  await expect(page.locator('[data-result-outcome="portal"]')).toContainText('帰還の門から帰還');
  await expect(page.locator('[data-result-memory]')).toContainText('物は失う。物語は残る');
  await expect(page.locator('[data-result-memory]')).toContainText('代表的な戦果');
  await expect(page.locator('[data-result-loot]')).toContainText('持込品（未使用分）');
  await expect(page.locator('[data-result-loot]')).toContainText('罠外しキット');
  expect(await page.locator('[data-result-loot]').textContent()).toMatch(/罠外しキット/);
  expect((await page.locator('[data-result-loot]').textContent()).match(/罠外しキット/g)).toHaveLength(1);
  await expect(page.locator('[data-result-discoveries]')).toContainText('Codex');
  await expect(page.locator('[data-result-discoveries]')).toContainText('可能性');
  const order = await page.locator('.result-body').evaluate((body) =>
    [...body.children].map((child) => child.dataset.resultMemory !== undefined
      ? 'memory'
      : child.dataset.resultLoot !== undefined
        ? 'loot'
        : child.id === 'result-material-title' || child.querySelector('#result-material-title')
          ? 'materials'
          : child.dataset.resultDiscoveries !== undefined ? 'discoveries' : child.className)
  );
  expect(order.indexOf('memory')).toBeLessThan(order.indexOf('loot'));
  expect(order.indexOf('loot')).toBeLessThan(order.indexOf('materials'));
  expect(await page.locator('#result-overlay').textContent()).not.toContain('戦果価値');
});

test('Death result preserves departure items and removes dungeon loot', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const loot = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createSoloCharacter, initNewGame, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    initNewGame();
    const found = { kind: 'equipment', baseId: 'SHORT_SWORD', instanceId: 'run_loot_1', identified: false, unidentifiedName: '未鑑定の短剣' };
    state.party = [createSoloCharacter('Fighter')];
    state.inventory = ['TRAP_KIT', found];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.characterClass = 'Fighter';
    state.currentRun.departureItems = ['TRAP_KIT'];
    state.currentRun.townInventory = ['TRAP_KIT'];
    state.currentRun.unbankedObjectLoot = [{ id: 'run_loot_1', item: found }];
    state.currentRun.equipmentFound = [found];
    state.currentRun.deepestFloor = 3;
    state.floor = 3;
    state.gameState = 'explore';
    triggerRunResult('gameover');
    return {
      inventory: state.inventory,
      storage: state.storage,
      state: state.gameState,
      lost: document.querySelector('[data-result-loot] .result-loot-lost')?.textContent || '',
      returned: document.querySelector('[data-result-loot] .result-loot-carried')?.textContent || ''
    };
  });

  expect(loot.inventory).toEqual([]);
  expect(loot.storage).toContain('TRAP_KIT');
  expect(loot.state).toBe('result');
  expect(loot.lost).toContain('未鑑定の短剣');
  expect(loot.returned).toContain('罠外しキット');
});

test('Town home is organized as previous run, next descent, and accumulated knowledge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'town';
    state.currentRun = null;
    state.runHistory = [{ outcome: 'death', returnReason: 'gameover', className: 'Mage', deepestFloor: 7 }];
    updateUI();
  });

  const home = page.locator('[data-town-home]');
  await expect(home).toBeVisible();
  await expect(home.locator('.town-home-section').nth(0)).toContainText('前回の冒険');
  await expect(home.locator('.town-home-section').nth(0)).toContainText('死亡');
  await expect(home.locator('.town-home-section').nth(1)).toContainText('次の潜行');
  await expect(home.locator('#town-next-run-title')).toHaveText('次の潜行に備える');
  await expect(home.locator('.town-home-section').nth(2)).toContainText('蓄積した記録');
  await expect(page.locator('#btn-town-dungeon')).toContainText('準備を整える');
  await expect(page.locator('#btn-town-quest-board')).toContainText('今回の依頼を選ぶ');
  await expect(page.locator('#btn-town-archives')).toContainText('迷宮について分かったこと');
  await expect(page.locator('#btn-town-workshop')).toContainText('広がった可能性を見る');
});

test('Castle presents death causes as facts with preparation choices', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'town';
    state.currentRun = null;
    state.deathLogs = [{ floor: 5, cause: '火炎の罠', type: 'trap', source: '火炎の罠' }];
    updateUI();
  });
  await page.locator('#btn-town-castle').click();
  await page.getByRole('button', { name: '全滅ログ確認' }).click();
  const countermeasure = page.locator('.death-countermeasure');
  await expect(countermeasure).toContainText('準備を見直す');
  await expect(countermeasure).toContainText('広がった可能性を見る');
  for (const specificSolution of ['罠外しキット', '罠喰いの記憶', '解毒薬', '目薬', '守りの薬', '生命鍛錬']) {
    await expect(countermeasure).not.toContainText(specificSolution);
  }
});
