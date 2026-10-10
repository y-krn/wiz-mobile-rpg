import { test, expect } from './fixtures/browser-health.js';
import { waitForAppStart } from './ui-ux-helpers.js';

async function townFixture(page, run = null) {
  await page.goto('/');
  await waitForAppStart(page);
  await page.evaluate(async history => {
    const { initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    initNewGame();
    state.gameState = 'town';
    state.runHistory = history ? [history] : [];
    state.metaMaterials = { '獣の牙': 7, '骨片': 4, '鉄片': 12, gold: 999, gems: 88 };
    updateUI();
  }, run);
}

for (const reason of ['gameover', 'abandon', 'surface', 'escape_scroll']) {
  test(`Town adventure summary distinguishes ${reason} from preserved materials @smoke`, async ({ page }) => {
    await townFixture(page, {
      outcome: reason === 'gameover' ? 'death' : reason === 'abandon' ? 'abandon' : 'retreat',
      returnReason: reason, deepestFloor: 10,
      bankedMaterials: { '獣の牙': 3, gold: 999 },
      lostSupplyCount: 2, lostUnidentifiedCount: 1, returnedSupplyCount: 1,
    });
    const summary = page.locator('#town-last-run-summary');
    await expect(summary).toContainText('忘れられた地下墓地 B5F');
    await expect(summary).not.toContainText('B10F');
    await expect(summary).toContainText('獣の牙 ×3');
    await expect(summary).not.toContainText('gold');
    const lost = ['gameover', 'abandon'].includes(reason);
    if (lost) {
      await expect(summary).toContainText(reason === 'gameover' ? '死亡' : '断念');
      await expect(summary).toContainText('失ったもの');
      await expect(summary.locator('s')).toContainText('未使用の持ち込み品 2個');
      await expect(summary).toContainText('街に残った素材：獣の牙 ×3');
      await expect(summary).not.toContainText('保全・回収');
      await expect(summary).not.toContainText('持ち帰');
    } else {
      await expect(summary).toContainText(reason === 'surface' ? '歩いて地上へ帰還' : '帰還の翼で帰還');
      await expect(summary).toContainText('持ち帰ったもの');
      await expect(summary).not.toContainText('失ったもの');
    }
  });
}

for (const { reason, quantity } of [
  ...['gameover', 'abandon', 'surface', 'escape_scroll'].map(reason => ({ reason, quantity: 10 })),
  ...['gameover', 'abandon'].map(reason => ({ reason, quantity: 3 })),
]) {
  test(`Actual ${reason}${quantity === 3 ? ' with zero banked materials' : ''} settlement reaches town and castle with consistent loss wording @smoke`, async ({ page }) => {
    await page.goto('/');
    await waitForAppStart(page);
    const settled = await page.evaluate(async ({ reason, quantity }) => {
      const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
      const { triggerRunResult } = await import('/src/result.js');
      initNewGame();
      const found = { kind: 'equipment', baseId: 'SHORT_SWORD', instanceId: 'town_loss_loot', identified: false, unidentifiedName: '未鑑定の短剣' };
      state.party = [createStartingKitCharacter('vanguard')];
      state.inventory = ['TRAP_KIT', found];
      const run = createDefaultCurrentRun();
      Object.assign(run, {
        startingKit: 'vanguard', characterClass: 'Fighter', deepestFloor: 2,
        departureItems: ['TRAP_KIT'], departureCraftItems: ['TRAP_KIT'], townInventory: ['TRAP_KIT'],
        equipmentFound: [found], unbankedObjectLoot: [{ id: found.instanceId, item: found }],
        materials: { '獣の牙': quantity },
      });
      state.currentRun = run;
      state.metaMaterials = { '獣の牙': 2 };
      state.floor = 2;
      state.gameState = 'explore';
      triggerRunResult(reason);
      return {
        banked: state.runHistory[0].bankedMaterials['獣の牙'],
        balance: state.metaMaterials['獣の牙'],
        lostSupplies: state.runHistory[0].lostSupplyCount,
        lostEquipment: state.runHistory[0].lostUnidentifiedCount,
        facilities: state.facilities,
      };
    }, { reason, quantity });
    const lost = ['gameover', 'abandon'].includes(reason);
    // Current settlement is 30% even without a facility; #2096 changes its
    // presentation, not the economic rule. Safe returns bank the full amount.
    const expectedBanked = quantity === 3 ? 0 : lost ? 3 : 10;
    expect(settled.banked).toBe(expectedBanked);
    expect(settled.balance).toBe(2 + expectedBanked);
    expect(settled.lostSupplies).toBe(lost ? 1 : 0);
    expect(settled.lostEquipment).toBe(lost ? 1 : 0);
    expect(settled.facilities.nodes).toEqual([]);
    await page.locator('#btn-result-castle').click();
    await expect(page.locator('#town-controls')).toBeVisible();
    await page.reload();
    await expect(page.locator('#town-controls')).toBeVisible();
    const summary = page.locator('#town-last-run-summary');
    if (expectedBanked > 0) await expect(summary).toContainText(`獣の牙 ×${expectedBanked}`);
    if (lost) {
      await expect(summary).toContainText('失ったもの');
      await expect(summary).toContainText('未使用の持ち込み品 1個');
      await expect(summary).toContainText('迷宮で見つけた装備 1個');
      await expect(summary).toContainText(expectedBanked > 0 ? '街に残った素材：獣の牙 ×3' : '街に残った素材なし');
      await expect(summary).not.toContainText('内訳は未記録');
      await expect(summary).not.toContainText('持ち帰');
      await expect(summary).not.toContainText('保全・回収');
    } else {
      await expect(summary).toContainText('持ち帰ったもの');
      await expect(summary).not.toContainText('失ったもの');
    }
    await page.locator('#btn-town-castle').click();
    const history = page.locator('.adventure-run-decision').first();
    if (lost) {
      await expect(history).toContainText('失ったもの：未使用の持ち込み品 1個、迷宮で見つけた装備 1個');
      await expect(history).toContainText(expectedBanked > 0 ? '街に残った素材：獣の牙 ×3' : '街に残った素材なし');
      await expect(history).not.toContainText('内訳は未記録');
      await expect(history).not.toContainText('持ち帰');
      await expect(history).not.toContainText('保全・回収');
    } else {
      await expect(history).toContainText('素材10個を持ち帰った');
      await expect(history).not.toContainText('失ったもの');
    }
  });
}

for (const reason of ['gameover', 'abandon']) {
  test(`Town summaries leave missing ${reason} breakdowns unknown @smoke`, async ({ page }) => {
    await townFixture(page, { outcome: reason === 'gameover' ? 'death' : 'abandon', returnReason: reason, deepestFloor: 3, lootCount: 99 });
    await expect(page.locator('#town-last-run-summary')).toContainText('失った品の内訳は未記録');
    await expect(page.locator('#town-last-run-summary')).not.toContainText('99');
    await expect(page.locator('#town-last-run-summary')).not.toContainText('持ち帰');
    await page.locator('#btn-town-castle').click();
    const history = page.locator('.adventure-run-decision').first();
    await expect(history).toContainText('失った品の内訳は未記録');
    await expect(history).toContainText('街に残った素材の内訳は未記録');
    await expect(history).not.toContainText('街に残った素材なし');
    await expect(history).not.toContainText('99');
    await expect(history).not.toContainText('持ち帰');
    await page.locator('#btn-submenu-back').click();
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.runHistory = [{ outcome: 'retreat', returnReason: 'surface', deepestFloor: 3 }];
      updateUI();
    });
    await expect(page.locator('#town-last-run-summary')).toContainText('内訳は記録されていません');
    await expect(page.locator('#town-last-run-summary')).not.toContainText('素材 0個');
  });
}

test('Town shows real nearest feats, tie order, completion and every owned material @smoke', async ({ page }) => {
  await townFixture(page);
  for (const mode of ['zero', 'progress', 'completed']) {
    const expected = await page.evaluate(async mode => {
      const { state } = await import('/src/state.js');
      const { FEATS } = await import('/src/data/feats.js');
      const { MATERIAL_TYPES } = await import('/src/data/materials.js');
      const { getNearestFeats, formatFeatProgress, formatFeatReward } = await import('/src/systems/feats.js');
      const { updateUI } = await import('/src/ui.js');
      if (mode === 'progress') Object.assign(state.feats.counters, { bestDepth: 4, chestsOpened: 8, safeReturns: 1 });
      if (mode === 'completed') state.feats.completed = Object.fromEntries(FEATS.map(feat => [feat.id, { runNumber: 1 }]));
      state.metaMaterials = Object.fromEntries(MATERIAL_TYPES.map((name, i) => [name, i + 1]));
      state.metaMaterials.gold = 999;
      const nearest = getNearestFeats(state.feats, null, 3).map(({ feat, progress }) => ({
        id: feat.id, name: feat.name, progress: formatFeatProgress(feat, progress), reward: formatFeatReward(feat), ratio: progress.ratio,
      }));
      updateUI();
      return { nearest, materials: MATERIAL_TYPES };
    }, mode);
    const cards = page.locator('#town-feat-summary .feat-card');
    await expect(cards).toHaveCount(expected.nearest.length);
    for (const [index, feat] of expected.nearest.entries()) {
      await expect(cards.nth(index)).toHaveAttribute('data-feat-id', feat.id);
      await expect(cards.nth(index)).toContainText(feat.name);
      await expect(cards.nth(index)).toContainText(feat.progress);
      await expect(cards.nth(index)).toContainText(feat.reward);
      if (index) expect(feat.ratio).toBeLessThanOrEqual(expected.nearest[index - 1].ratio);
    }
    if (mode === 'completed') await expect(page.locator('#town-feat-summary')).toHaveText('すべての偉業を達成した。');
    await expect(page.locator('#town-material-summary dt')).toHaveText(expected.materials);
    await expect(page.locator('#town-material-summary')).not.toContainText('gold');
    await expect(page.locator('#town-material-summary')).not.toContainText('999');
  }
});

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 450, height: 844 }]) {
  test(`Town scene preserves taps, one scroll and rerender position at ${viewport.width}px @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await townFixture(page);
    await page.addStyleTag({ content: ':root { --safe-area-top: 20px; --safe-area-bottom: 34px; }' });
    await page.locator('.town-scene-image').evaluate(img => img.decode());
    for (const full of [false, true]) {
      await page.evaluate(async full => {
        const { state } = await import('/src/state.js');
        const { FEATS } = await import('/src/data/feats.js');
        const { updateUI } = await import('/src/ui.js');
        if (full) state.feats.completed = Object.fromEntries(FEATS.map(feat => [feat.id, { runNumber: 1 }]));
        updateUI();
      }, full);
      await expect(page.locator('#town-facilities button:not(:disabled)')).toHaveCount(full ? 6 : 0);
      await expect(page.locator('#btn-town-dungeon')).toBeInViewport();
      const evidence = await page.evaluate(() => {
        const shell = document.getElementById('game-container');
        return {
          overflow: shell.scrollWidth - shell.clientWidth,
          nested: [...shell.querySelectorAll('*')].filter(el => el.offsetParent && /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map(el => el.id),
          buttons: [...document.querySelectorAll('#town-controls button:not(:disabled)')].map(el => {
            const r = el.getBoundingClientRect();
            return { width: r.width, height: r.height, left: r.left, right: r.right };
          }),
          primaryBottom: document.querySelector('#btn-town-dungeon').getBoundingClientRect().bottom,
        };
      });
      expect(evidence.overflow).toBeLessThanOrEqual(1);
      expect(evidence.nested).toEqual([]);
      expect(evidence.primaryBottom).toBeLessThanOrEqual(viewport.height - 34 + 1);
      for (const button of evidence.buttons) {
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.left).toBeGreaterThanOrEqual(0);
        expect(button.right).toBeLessThanOrEqual(viewport.width);
      }
      const before = await page.locator('#game-container').evaluate(el => { el.scrollTop = 250; return el.scrollTop; });
      await page.evaluate(async () => (await import('/src/ui.js')).updateUI());
      expect(await page.locator('#game-container').evaluate(el => el.scrollTop)).toBe(before);
      await page.locator('#game-container').evaluate(el => { el.scrollTop = 0; });
    }
    await page.locator('#btn-town-castle').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#submenu-title')).toHaveText('城 - 記録');
  });
}

test('Town scene entrances retain archives, workshop, feats, guidebook and departure flows @smoke', async ({ page }) => {
  await townFixture(page);
  await page.locator('#btn-town-archives').click();
  await expect(page.locator('#archives-overlay')).toBeVisible();
  await page.locator('#archives-overlay').getByRole('button', { name: /閉じる/ }).click();
  for (const [button, title] of [['#btn-town-workshop', '工房'], ['#btn-town-feats', '偉業'], ['#btn-town-guidebook', '迷宮の手引き書']]) {
    await page.locator(button).click();
    await expect(page.locator('#submenu-title')).toContainText(title);
    await page.locator('#btn-submenu-back').click();
    await expect(page.locator('#town-controls')).toBeVisible();
  }
  await page.locator('#btn-town-dungeon').click();
  await expect(page.getByRole('button', { name: /鋼の前線キット/ })).toBeVisible();
});
