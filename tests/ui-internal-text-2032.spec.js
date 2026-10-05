import { test, expect } from './fixtures/browser-health.js';

// Internal notes and display slips found by the 2026-10 screen audit (#2032):
// design memos shown as hints, a stale location label on the result screen,
// a status badge sitting on the HP number, and claims about carried-in
// supplies the run never had.

async function openTown(page, viewport = { width: 390, height: 844 }) {
  await page.setViewportSize(viewport);
  await page.goto('/');
  await expect(page.locator('#town-controls')).toBeVisible();
}

async function showResult(page, { reason, outcome, lostTownItems = [] }) {
  await page.evaluate(async ({ reason, outcome, lostTownItems }) => {
    const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const run = createDefaultCurrentRun();
    run.returnReason = reason;
    run.outcome = outcome;
    run.deepestFloor = 2;
    run.materialsBeforeBanking = { '獣の牙': 10 };
    run.bankedMaterials = { '獣の牙': 3 };
    run.lostTownItems = lostTownItems;
    run.quests = [];
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = run;
    // The label of the screen the run ended on must not survive.
    document.getElementById('location-label').textContent = 'COMBAT';
    state.gameState = 'result';
    updateUI();
  }, { reason, outcome, lostTownItems });
}

test('Death result with nothing carried in does not claim lost supplies or repeat its lead', async ({ page }) => {
  await openTown(page);
  await showResult(page, { reason: 'gameover', outcome: 'death' });

  const header = page.locator('[data-result-outcome="death"]');
  await expect(header).toContainText('素材の一部を持ち帰った。記録と知識は残る。');
  await expect(header).not.toContainText('持ち込み品');
  const memory = page.locator('[data-result-memory]');
  await expect(memory).toContainText('まで到達');
  await expect(memory).not.toContainText('素材の一部を持ち帰った');
  await expect(page.locator('#location-label')).toHaveText('RESULT');
});

test('Death and abandon results still state the loss when supplies were carried in', async ({ page }) => {
  await openTown(page);
  await showResult(page, { reason: 'gameover', outcome: 'death', lostTownItems: ['HEAL_POTION'] });
  await expect(page.locator('[data-result-outcome="death"]')).toContainText('未使用の持ち込み品は失った');

  await showResult(page, { reason: 'abandon', outcome: 'abandon' });
  const abandon = page.locator('[data-result-outcome="abandon"]');
  await expect(abandon).toContainText('素材は死亡時と同じ割合で持ち帰った。');
  await expect(abandon).not.toContainText('持ち込み品');
});

for (const width of [390, 360, 320]) {
  test(`Status badge sits beside the level and clear of the HP and MP numbers at ${width}px`, async ({ page }) => {
    await openTown(page, { width, height: 700 });
    await page.evaluate(async () => {
      const { createDefaultCurrentRun, createStartingKitCharacter, state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      const hero = createStartingKitCharacter('arcana');
      hero.status = 'paralyzed';
      state.party = [hero];
      state.currentRun = createDefaultCurrentRun();
      state.gameState = 'explore';
      updateUI();
    });

    const status = page.locator('#character-hud .character-status');
    await expect(status).toHaveText('PARALYZED');
    const rects = await page.evaluate(() => {
      const rect = element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      };
      return {
        status: rect(document.querySelector('#character-hud .character-status')),
        card: rect(document.querySelector('#character-hud .character-card')),
        values: [...document.querySelectorAll('#character-hud .bar-container:not([hidden]) .bar-value')].map(rect),
      };
    });
    expect(rects.values.length).toBeGreaterThan(0);
    for (const value of rects.values) {
      const overlaps = rects.status.left < value.right && value.left < rects.status.right &&
        rects.status.top < value.bottom && value.top < rects.status.bottom;
      expect(overlaps).toBe(false);
    }
    expect(rects.status.left).toBeGreaterThanOrEqual(rects.card.left);
    expect(rects.status.right).toBeLessThanOrEqual(rects.card.right);
  });
}

test('Town menus hide the empty adventurer panel and the start-floor heading shows no design memo', async ({ page }) => {
  await openTown(page);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.party = [];
    state.unlockedMilestones = [];
    openSubmenu('solo_start', '出撃準備');
  });
  await expect(page.locator('[data-kit-id="vanguard"]')).toBeVisible();
  await expect(page.locator('#character-panel')).toBeHidden();

  await page.locator('[data-kit-id="vanguard"]').click();
  await page.locator('#btn-kit-confirm').click();
  const heading = page.locator('.solo-start-floor-heading');
  await expect(heading).toHaveText('開始階を選ぶ');

  // The trade-off is stated once a deeper start exists.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { openSubmenu } = await import('/src/navigation.js');
    state.unlockedMilestones = [6];
    openSubmenu('solo_start', '出撃準備');
    updateUI();
  });
  await page.locator('[data-kit-id="vanguard"]').click();
  await page.locator('#btn-kit-confirm').click();
  await expect(page.locator('.solo-start-floor-heading')).toContainText('深い階から始めると、手に入る素材は少なくなる。');
});
