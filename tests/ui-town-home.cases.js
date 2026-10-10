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
      await expect(summary).toContainText('街に残った素材（保全・回収分）');
      await expect(summary).not.toContainText('持ち帰');
    } else {
      await expect(summary).toContainText(reason === 'surface' ? '歩いて地上へ帰還' : '帰還の翼で帰還');
      await expect(summary).toContainText('持ち帰ったもの');
      await expect(summary).not.toContainText('失ったもの');
    }
  });
}

test('Town summaries use recorded quantities and leave missing breakdowns unknown @smoke', async ({ page }) => {
  await townFixture(page, { outcome: 'death', returnReason: 'gameover', deepestFloor: 3, lootCount: 99 });
  await expect(page.locator('#town-last-run-summary')).toContainText('失った品の内訳は未記録');
  await expect(page.locator('#town-last-run-summary')).not.toContainText('99');
  await expect(page.locator('#town-last-run-summary')).not.toContainText('持ち帰');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.runHistory = [{ outcome: 'retreat', returnReason: 'surface', deepestFloor: 3 }];
    updateUI();
  });
  await expect(page.locator('#town-last-run-summary')).toContainText('内訳は記録されていません');
  await expect(page.locator('#town-last-run-summary')).not.toContainText('素材 0個');
});

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
