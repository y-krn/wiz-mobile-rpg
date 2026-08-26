import { test, expect } from './fixtures/browser-health.js';

test('Castle presents the adventure chronicle before stats', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');

    state.records = {
      deepestRetreat: 8,
      deepestDeath: 5,
      deepestByClass: { Fighter: 8 },
      totalRuns: 2,
      personalBests: { deepestFloor: 8, kills: 14, chestsOpened: 5, lootCount: 7, goldEarned: 0 },
      adventureStats: {
        reachedB5: 2,
        brokeB5: 1,
        reachedB10: 0,
        floorDistribution: { 'B1-B4': 0, B5: 1, 'B6-B9': 1, 'B10+': 0 },
      },
      firstAchievements: [{ id: 'first_b5_reached', label: '初めてB5Fへ到達', runNumber: 1, floor: 5 }],
      deathCauses: [{ floor: 5, type: 'trap', source: '火炎の罠', count: 1 }],
    };
    state.runHistory = [
      {
        runNumber: 2,
        className: 'Fighter',
        deepestFloor: 8,
        kills: 14,
        chestsOpened: 5,
        outcome: 'retreat',
        returnReason: 'milestone_portal',
        milestones: [],
        recordUpdates: ['最深到達記録'],
      },
      {
        runNumber: 1,
        className: 'Fighter',
        deepestFloor: 5,
        kills: 7,
        chestsOpened: 2,
        outcome: 'death',
        returnReason: 'gameover',
        deathCause: { floor: 5, type: 'trap', source: '火炎の罠', label: '火炎の罠' },
      },
    ];
    state.gameState = 'town';
    updateUI();
  });

  await page.locator('#btn-town-castle').click();
  const records = page.locator('[data-adventure-records]');
  await expect(records).toBeVisible();
  await expect(records.locator('.adventure-chronicle')).toContainText('第1回');
  await expect(records.locator('.adventure-recent-history')).toContainText('帰還の門を選び');
  await expect(records.locator('.adventure-recent-history')).toContainText('火炎の罠に倒れた');
  await expect(records.locator('.adventure-record-section').nth(2)).toContainText('最多撃破');
  await expect(records.locator('.adventure-record-section').nth(3)).toContainText('B5Fを越えています');
  await expect(records.locator('.adventure-record-section').nth(4)).toContainText('火炎の罠');
});

test('Castle adventure records tolerate an empty history', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.records = { deepestRetreat: 0, deepestDeath: 0, deepestByClass: {}, totalRuns: 0 };
    state.runHistory = [];
    state.deathLogs = [];
    state.gameState = 'town';
    updateUI();
  });

  await page.locator('#btn-town-castle').click();
  await expect(page.locator('[data-adventure-records]')).toContainText('まだ冒険の記録はありません');
  await expect(page.locator('[data-adventure-records]')).toContainText('まだ死亡記録はありません');
});
