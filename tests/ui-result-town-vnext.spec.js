import { test, expect } from './fixtures/browser-health.js';

const HOSTILE_RESULT_TEXT = '<b>evil result</b><img src=x onerror="globalThis.__xss = 1">';

test('result screen renders save-derived names literally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const evidence = await page.evaluate(async hostile => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'milestone_portal';
    run.deepestFloor = 3;
    run.meaningfulItemHistory = [{ name: hostile, status: 'returned', depth: 3 }];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    state.gameState = 'result';
    window.__xss = 0;
    updateUI();
    return {
      itemText: document.querySelector('.result-return-history span')?.textContent,
      images: document.querySelectorAll('#result-overlay img').length,
      boldNodes: document.querySelectorAll('.result-return-history b').length,
      xss: window.__xss,
    };
  }, HOSTILE_RESULT_TEXT);

  expect(evidence).toEqual({
    itemText: HOSTILE_RESULT_TEXT,
    images: 0,
    boldNodes: 0,
    xss: 0,
  });
});

test('Result lists found loot without return or loss labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'milestone_portal';
    run.outcome = 'retreat';
    run.deepestFloor = 5;
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
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    state.gameState = 'result';
    updateUI();
  });

  await expect(page.locator('[data-result-outcome="portal"]')).toContainText('帰還');
  await expect(page.locator('[data-result-memory]')).toContainText('物は失う。物語は残る');
  await expect(page.locator('[data-result-memory]')).toContainText('この冒険を象徴する品');
  await expect(page.locator('#result-overlay')).not.toContainText('代表的な戦果');
  await expect(page.locator('[data-result-loot]')).toContainText('今回見つけた品');
  await expect(page.locator('[data-result-loot]')).toContainText('傷薬');
  await expect(page.locator('[data-result-loot]')).toContainText('未鑑定の短剣');
  await expect(page.locator('[data-result-loot]')).not.toContainText('帰還');
  await expect(page.locator('[data-result-loot]')).not.toContainText('喪失');
  await expect(page.locator('[data-result-loot]')).not.toContainText('翼で持ち帰り');
  expect((await page.locator('[data-result-loot]').textContent()).match(/傷薬/g)).toHaveLength(1);
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

test('Abandon result states death-rate material recovery and carried-supply loss', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = 'abandon';
    run.outcome = 'abandon';
    run.materialsBeforeBanking = { '獣の牙': 10 };
    run.bankedMaterials = { '獣の牙': 3 };
    run.lostTownItems = ['HEAL_POTION'];
    run.quests = [];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    state.gameState = 'result';
    updateUI();
  });

  await expect(page.locator('[data-result-outcome="abandon"]'))
    .toContainText('素材は死亡時と同じ割合で持ち帰り');
  await expect(page.locator('[data-result-outcome="abandon"]'))
    .toContainText('未使用の持ち込み品は失った');
});

test('Death result loses unused departure supplies and dungeon loot', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const loot = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    initNewGame();
    const found = { kind: 'equipment', baseId: 'SHORT_SWORD', instanceId: 'run_loot_1', identified: false, unidentifiedName: '未鑑定の短剣' };
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = ['TRAP_KIT', found];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.characterClass = 'Fighter';
    state.currentRun.departureItems = ['TRAP_KIT'];
    state.currentRun.departureCraftItems = ['TRAP_KIT'];
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
      loot: document.querySelector('[data-result-loot]')?.textContent || ''
    };
  });

  expect(loot.inventory).toEqual([]);
  expect(loot.storage).not.toContain('TRAP_KIT');
  expect(loot.state).toBe('result');
  expect(loot.loot).toContain('未鑑定の短剣');
  expect(loot.loot).not.toContain('死亡・断念で失った持込品');
  expect(loot.loot).not.toContain('倉庫へ戻った持込品');
});

test('Death result states how close the run was', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const facts = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.inventory = ['TOWN_PORTAL', 'HEAL_POTION', 'HEAL_POTION'];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.townInventory = state.inventory.slice();
    state.currentRun.departureCraftItems = state.inventory.slice();
    state.currentRun.deepestFloor = 5;
    state.floor = 5;
    state.records.personalBests.deepestFloor = 7;
    state.combatState = { isBoss: true, monsters: [{ name: 'デーモンガード', hp: 20, maxHp: 120 }] };
    state.gameState = 'combat';
    triggerRunResult('gameover');
    const section = document.querySelector('[data-result-near-miss]');
    return {
      heading: section?.querySelector('h2')?.textContent || '',
      items: [...(section?.querySelectorAll('li') || [])].map(item => item.textContent),
      text: section?.textContent || ''
    };
  });

  expect(facts.heading).toContain('あと少しだった点');
  expect(facts.items).toEqual([
    '階層守護者・デーモンガードを重傷まで追い込んでいた',
    '自己最深 B7F まであと2階だった',
    '帰還の門は、この階の階層守護者の先にあった',
    '使わずに残っていた物：帰還の翼×1、傷薬×2'
  ]);
  expect(facts.text).not.toMatch(/%/);

  await page.reload();
  await expect(page.locator('[data-result-near-miss] li').first())
    .toHaveText('階層守護者・デーモンガードを重傷まで追い込んでいた');
});

test('Return result shows no near-miss section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const sections = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    const counts = [];
    for (const reason of ['milestone_portal', 'abandon']) {
      initNewGame();
      state.party = [createStartingKitCharacter('vanguard')];
      state.inventory = ['TOWN_PORTAL'];
      state.currentRun = createDefaultCurrentRun();
      state.currentRun.deepestFloor = 3;
      state.floor = 3;
      state.records.personalBests.deepestFloor = 7;
      state.gameState = 'explore';
      triggerRunResult(reason);
      counts.push(document.querySelectorAll('[data-result-near-miss]').length);
    }
    return counts;
  });

  expect(sections).toEqual([0, 0]);
});

async function seedResultWithLastPreparation(page, { materials, storage = [], reason = 'gameover', lastPreparation }) {
  await page.evaluate(async ({ materials, storage, reason, lastPreparation }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.deepestFloor = 2;
    state.floor = 2;
    state.gameState = 'explore';
    state.metaMaterials = materials;
    state.storage = storage;
    state.lastPreparation = lastPreparation;
    triggerRunResult(reason);
  }, { materials, storage, reason, lastPreparation });
}

for (const reason of ['gameover', 'abandon', 'milestone_portal']) {
  test(`Result offers the same preparation again after ${reason}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await seedResultWithLastPreparation(page, {
      materials: { '硬い皮': 3, '獣の牙': 3 },
      storage: ['HEAL_POTION'],
      reason,
      lastPreparation: { kitId: 'vanguard', startingGear: null, recipeIds: ['HEAL_POTION', 'HEAL_POTION'], startFloor: 1 }
    });

    const again = page.locator('#btn-result-again');
    await expect(again).toHaveAttribute('data-result-next', 'repeat');
    await expect(again).toContainText('同じ準備でもう一度');
    await expect(again).toContainText('鋼の前線キット・B1Fから・道具2品（倉庫から1品・支払い：硬い皮1・獣の牙1）');
    await expect(page.locator('#btn-result-castle')).toHaveText('街へ戻る');

    // A replayed activation must not start or charge a second departure.
    const after = await page.evaluate(async () => {
      const button = document.getElementById('btn-result-again');
      button.click();
      button.click();
      const { state } = await import('/src/state.js');
      return {
        gameState: state.gameState,
        kit: state.currentRun?.startingKit,
        startFloor: state.currentRun?.startFloor,
        potions: state.inventory.filter(item => (item?.baseId || item) === 'HEAL_POTION').length,
        storage: state.storage.length,
        hide: state.metaMaterials['硬い皮'],
        fang: state.metaMaterials['獣の牙'],
        questCount: state.currentRun?.quests?.length || 0,
        log: state.logs.join('\n')
      };
    });
    expect(after.gameState).toBe('explore');
    expect(after.kit).toBe('vanguard');
    expect(after.startFloor).toBe(1);
    expect(after.potions).toBe(2);
    expect(after.storage).toBe(0);
    expect(after.hide).toBe(2);
    expect(after.fang).toBe(2);
    expect(after.questCount).toBe(0);
    expect(after.log).not.toContain('依頼');
    await expect(page.locator('#result-overlay')).toBeHidden();
    await expect(page.locator('#submenu-controls')).toBeHidden();
  });
}

test('Result sends an unaffordable repeat to the pre-filled preparation instead of leaving with less', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedResultWithLastPreparation(page, {
    materials: { '硬い皮': 1, '獣の牙': 1 },
    lastPreparation: { kitId: 'scout', startingGear: null, recipeIds: ['HEAL_POTION', 'HEAL_POTION'], startFloor: 1 }
  });

  const again = page.locator('#btn-result-again');
  await expect(again).toHaveAttribute('data-result-next', 'review');
  await expect(again).toContainText('準備を見直して出発');
  await expect(again).toContainText('前回と同じ準備は揃えられない');
  await again.click();

  await expect(page.locator('#btn-departure-start')).toBeEnabled();
  await expect(page.locator('.solo-preparation-dropped')).toContainText('前回の準備から外したもの');
  await expect(page.locator('.solo-preparation-dropped li')).toHaveText(['傷薬×1（素材不足）']);
  await expect(page.locator('.solo-preparation-summary')).toContainText('軽装探索キット');
  await expect(page.locator('[data-recipe-id="HEAL_POTION"]')).toContainText('1個');
  await expect(page.locator('[data-start-floor="1"]')).toHaveAttribute('aria-pressed', 'true');
  const materials = await page.evaluate(async () => (await import('/src/state.js')).state.metaMaterials);
  expect(materials['硬い皮']).toBe(1);
});

test('Result without a previous preparation only offers the town', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await seedResultWithLastPreparation(page, { materials: {}, lastPreparation: null });
  await expect(page.locator('#btn-result-again')).toHaveCount(0);
  await expect(page.locator('#btn-result-castle')).toHaveClass(/btn-primary/);
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#town-controls')).toBeVisible();
});

test('Town preparation opens with the previous choices and still allows changing the kit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.metaMaterials = { '硬い皮': 4, '獣の牙': 4 };
    state.unlockedMilestones = [5];
    state.lastPreparation = { kitId: 'devotion', startingGear: null, recipeIds: ['HEAL_POTION'], startFloor: 5 };
    updateUI();
  });
  await page.locator('#btn-town-dungeon').click();

  await expect(page.locator('.solo-preparation-summary')).toContainText('祈りの旅装キット');
  await expect(page.locator('[data-start-floor="5"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-recipe-id="HEAL_POTION"]')).toContainText('1個');
  await expect(page.locator('.solo-preparation-dropped')).toHaveCount(0);
  await expect(page.locator('#btn-departure-start')).toBeEnabled();

  await page.getByRole('button', { name: '開始キットを選び直す' }).click();
  await expect(page.locator('[data-kit-id="devotion"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-kit-id="scout"]').click();
  await page.locator('#btn-kit-confirm').click();
  await expect(page.locator('.solo-preparation-summary')).toContainText('軽装探索キット');
  // Changing the kit keeps the tools and floor already chosen.
  await expect(page.locator('[data-recipe-id="HEAL_POTION"]')).toContainText('1個');
  await expect(page.locator('[data-start-floor="5"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#btn-departure-start').click();
  const remembered = await page.evaluate(async () => (await import('/src/state.js')).state.lastPreparation);
  expect(remembered).toEqual({ kitId: 'scout', startingGear: null, recipeIds: ['HEAL_POTION'], startFloor: 5 });
});

test('Town shows the three closest feats and opens the full list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.feats.counters.bestDepth = 7;
    state.feats.counters.guardianDepth = 5;
    state.feats.counters.elitesKilled = 4;
    state.feats.counters.chestsOpened = 3;
    state.feats.completed = { depth_5: { runNumber: 2 }, guardian_5: { runNumber: 3 } };
    updateUI();
  });

  const cards = page.locator('#town-feat-summary .feat-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute('data-feat-id', 'elite_5');
  await expect(cards.nth(0)).toContainText('強敵狩り');
  await expect(cards.nth(0)).toContainText('4 / 5');
  await expect(cards.nth(0)).toContainText('強敵（精鋭・徘徊強敵）を累計5体倒す');
  await expect(cards.nth(0)).toContainText('報酬 黒角×3');
  await expect(cards.nth(1)).toHaveAttribute('data-feat-id', 'depth_10');
  await expect(cards.nth(1)).toContainText('B7F / B10F');
  await expect(cards.nth(2)).toHaveAttribute('data-feat-id', 'guardian_10');
  await expect(page.locator('#btn-town-feats')).toContainText('達成 2 / 21');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.locator('#btn-town-feats').click();
  await expect(page.locator('#submenu-title')).toContainText('偉業');
  await expect(page.locator('.feat-list-summary')).toContainText('達成 2 / 21');
  await expect(page.locator('.feat-list-grid .feat-card')).toHaveCount(21);
  await expect(page.locator('.feat-card[data-feat-id="depth_5"]')).toHaveAttribute('data-feat-completed', 'true');
  await expect(page.locator('.feat-card[data-feat-id="depth_5"]')).toContainText('受け取り済み');
  await expect(page.locator('.feat-card[data-feat-id="kits_4"]')).toContainText('0 / 4');
  await page.locator('#btn-submenu-back').click();
  await expect(page.locator('#town-controls')).toBeVisible();
});

test('Result shows the feats achieved and how far the closest ones moved', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const outcome = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { triggerRunResult } = await import('/src/result.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.startFloor = 1;
    state.currentRun.startingKit = 'vanguard';
    state.currentRun.deepestFloor = 5;
    state.currentRun.elitesKilled = 2;
    state.currentRun.trapsTriggered = 1;
    state.floor = 5;
    state.gameState = 'explore';
    state.feats.counters.elitesKilled = 1;
    state.metaMaterials = { '鉄片': 1 };
    triggerRunResult('gameover');
    return { iron: state.metaMaterials['鉄片'], completed: Object.keys(state.feats.completed) };
  });
  expect(outcome).toEqual({ iron: 5, completed: ['depth_5'] });

  const rows = page.locator('[data-result-feats] .result-feat-row');
  await expect(rows.nth(0)).toHaveText('達成坑道を抜ける報酬 鉄片×4');
  await expect(page.locator('.result-feat-row[data-feat-id="elite_5"]')).toHaveText('前進強敵狩り3 / 5（今回 +2）');
  await expect(page.locator('.result-feat-row[data-feat-id="depth_10"]')).toHaveText('前進地下墓地の底へB5F / B10F');
  await expect(page.locator('#result-overlay')).not.toContainText('今回の依頼');

  await page.reload();
  await expect(page.locator('[data-result-feats] .result-feat-row').nth(0)).toContainText('坑道を抜ける');
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#town-feat-summary .feat-card').first()).toHaveAttribute('data-feat-id', 'elite_5');
});

test('Explore shows the closest feats with live progress and announces a feat once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.feats.counters.bestDepth = 4;
    state.feats.counters.chestsOpened = 29;
    updateUI();
  });
  await page.locator('#btn-town-dungeon').click();
  await page.locator('.solo-starting-kit-option').first().click();
  await page.locator('#btn-kit-confirm').click();
  await page.locator('#btn-departure-start').click();
  await expect(page.locator('#explore-controls')).toBeVisible();
  await expect(page.locator('#log-content')).not.toContainText('依頼');

  const live = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { getFeatAnnouncementLines } = await import('/src/systems/feats.js');
    state.currentRun.chestsOpened = 1;
    const first = getFeatAnnouncementLines(state.feats, state.currentRun);
    const second = getFeatAnnouncementLines(state.feats, state.currentRun);
    updateUI();
    return {
      first,
      second,
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent),
      storedChests: state.feats.counters.chestsOpened
    };
  });
  expect(live.first).toEqual(['【偉業達成】宝箱あさり（宝箱を累計30個開ける）。報酬は街で受け取る。']);
  expect(live.second).toEqual([]);
  expect(live.hud).toEqual(['宝箱あさり達成', '坑道を抜けるB4F / B5F', '傷なき踏破B1F / B5F']);
  expect(live.storedChests).toBe(29);
});

test('Town home is organized as previous run, next descent, and accumulated knowledge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'town';
    state.currentRun = null;
    state.runHistory = [{ outcome: 'death', returnReason: 'gameover', startingKit: 'scout', deepestFloor: 7 }];
    updateUI();
  });

  const home = page.locator('[data-town-home]');
  await expect(home).toBeVisible();
  await expect(home.locator('.town-home-section').nth(0)).toContainText('前回の冒険');
  await expect(home.locator('.town-home-section').nth(0)).toContainText('死亡');
  await expect(home.locator('.town-home-section').nth(0)).toContainText('開始キット');
  await expect(home.locator('.town-home-section').nth(1)).toContainText('次の潜行');
  await expect(home.locator('#town-next-run-title')).toHaveText('あと少しで届く偉業');
  await expect(home.locator('.town-home-section').nth(2)).toContainText('街の施設');
  await expect(home.locator('.town-home-section').nth(3)).toContainText('蓄積した記録');
  await expect(page.locator('#btn-town-dungeon')).toContainText('準備を整える');
  await expect(page.locator('#btn-town-dungeon')).toContainText('開始キットと開始地点を選ぶ');
  await expect(page.locator('#btn-town-dungeon')).not.toContainText('クラス');
  await expect(page.locator('#btn-town-quest-board')).toHaveCount(0);
  await expect(page.locator('#btn-town-feats')).toContainText('偉業の一覧を見る');
  await expect(page.locator('#btn-town-archives')).toContainText('迷宮について分かったこと');
  await expect(page.locator('#btn-town-workshop')).toContainText('広がった可能性を見る');
});

test('Town home without a recorded run offers the castle as a records visit', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'town';
    state.currentRun = null;
    state.party = [];
    state.runHistory = [];
    updateUI();
  });

  const lastRun = page.locator('.town-home-last-run');
  await expect(lastRun).toHaveAttribute('data-empty', 'true');
  await expect(lastRun).toContainText('まだ冒険の記録はありません');
  await expect(page.locator('#town-last-run-title')).toBeHidden();
  await expect(page.locator('#btn-town-castle')).toContainText('おしろを訪ねる');
  await expect(page.locator('#btn-town-castle')).not.toContainText('冒険記録を見る');
  await expect(page.locator('#character-panel')).toBeHidden();
  await expect(page.locator('#btn-town-dungeon')).toBeInViewport();

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.runHistory = [{ outcome: 'retreat', returnReason: 'milestone_portal', deepestFloor: 3 }];
    updateUI();
  });
  await expect(lastRun).toHaveAttribute('data-empty', 'false');
  await expect(page.locator('#btn-town-castle')).toContainText('冒険記録を見る');
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
  await expect(countermeasure).toContainText('開始キット・持込品・開始地点を比較する。');
  await expect(countermeasure).not.toContainText('クラス');
  await expect(countermeasure).toContainText('広がった可能性を見る');
  for (const specificSolution of ['罠外しキット', '罠喰いの記憶', '解毒薬', '目薬', '守りの薬', '生命鍛錬']) {
    await expect(countermeasure).not.toContainText(specificSolution);
  }
});
