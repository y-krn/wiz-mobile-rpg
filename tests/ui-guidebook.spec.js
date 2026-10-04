import { test, expect } from './fixtures/browser-health.js';

// The dungeon guidebook (#2013): fragments won from strong enemies come home
// only with a safe return, and decode pages in the town.

test('Fragments are shown as a stake, kept by a safe return, and decode a page in the town', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const stake = await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { createRunStakesSummary } = await import('/src/ui/run_stakes.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.startFloor = 1;
    state.currentRun.deepestFloor = 3;
    state.currentRun.guideFragments = 2;
    state.floor = 3;
    state.gameState = 'explore';
    updateUI();
    return {
      line: createRunStakesSummary().querySelector('.run-stakes-fragments')?.textContent || '',
      hud: [...document.querySelectorAll('#goal-banner .feat-hud-list span')].map(item => item.textContent)
    };
  });
  expect(stake.line).toBe('手引き書の断片 2枚。生還すれば持ち帰る。死ねば・断念すれば失う。');
  expect(stake.hud[0]).toBe('手引き書の断片2枚・生還で持ち帰り');

  await page.evaluate(async () => {
    (await import('/src/result.js')).triggerRunResult('milestone_portal');
  });
  await expect(page.locator('.result-feat-row[data-feat-id="guide_fragments"]'))
    .toHaveText('持ち帰り手引き書の断片 2枚街で頁の解読に使える');
  await page.locator('#btn-result-castle').click();

  const entry = page.locator('#btn-town-guidebook');
  await expect(entry).toContainText('断片 2枚・解読 0 / 8頁・解読できる頁がある');
  await entry.click();
  await expect(page.locator('#submenu-title')).toContainText('迷宮の手引き書');
  await expect(page.locator('.guidebook-page')).toHaveCount(8);
  await expect(page.locator('.guidebook-page').first()).toContainText('（未解読）');
  await expect(page.locator('.guidebook-page').first()).not.toContainText('音で狩るもの');

  await page.locator('#btn-guidebook-decode').click();
  const first = page.locator('.guidebook-page').first();
  await expect(first).toHaveAttribute('data-guidebook-decoded', 'true');
  await expect(first).toContainText('第1頁：音で狩るもの');
  await expect(first).toContainText('その場所へ向かってくる');
  await expect(page.locator('.guidebook-summary')).toContainText('断片 0枚・解読 1 / 8頁');
  // The next page needs two more fragments.
  await expect(page.locator('#btn-guidebook-decode')).toBeDisabled();
  await expect(page.locator('.guidebook-page').nth(1)).toContainText('あと2枚で解読できる。');
  await expect(page.locator('.guidebook-page').nth(2)).toContainText('前の頁を解読すると読めるようになる。');

  await page.reload();
  const saved = await page.evaluate(async () => (await import('/src/state.js')).state.guidebook);
  expect(saved).toEqual({ fragments: 0, decoded: 1 });
});

test('Fragments are lost with a death and the third page settles its feat in the town', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDefaultCurrentRun, createStartingKitCharacter, initNewGame, state } = await import('/src/state.js');
    initNewGame();
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.deepestFloor = 3;
    state.currentRun.guideFragments = 3;
    state.guidebook = { fragments: 3, decoded: 2 };
    state.floor = 3;
    state.gameState = 'explore';
    (await import('/src/result.js')).triggerRunResult('gameover');
  });
  const lost = page.locator('.result-feat-row[data-feat-id="guide_fragments"]');
  await expect(lost).toHaveText('喪失手引き書の断片 3枚生還しなければ残らない');
  await expect(lost).toHaveClass(/failed/);
  await page.locator('#btn-result-castle').click();
  await expect(page.locator('#btn-town-guidebook')).toContainText('断片 3枚・解読 2 / 8頁');

  await page.locator('#btn-town-guidebook').click();
  const before = await page.evaluate(async () => (await import('/src/state.js')).state.metaMaterials['霊粉'] || 0);
  await page.locator('#btn-guidebook-decode').click();
  await expect(page.locator('.guidebook-page').nth(2)).toContainText('見られると動けないもの');
  const after = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      spirit: state.metaMaterials['霊粉'] || 0,
      feat: Object.hasOwn(state.feats.completed, 'guide_pages_3'),
      guidebook: state.guidebook,
      log: state.logs.join('\n')
    };
  });
  expect(after.spirit - before).toBe(4);
  expect(after.feat).toBe(true);
  expect(after.guidebook).toEqual({ fragments: 0, decoded: 3 });
  expect(after.log).toContain('【偉業達成】手引き書を読み解く');
});
