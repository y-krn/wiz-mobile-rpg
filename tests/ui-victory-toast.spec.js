import { test, expect } from './fixtures/browser-health.js';

// #1840: a victory shows experience, materials, first-kill rewards, and
// level-ups in one band over the dungeon view; a tap closes it and it
// auto-hides otherwise so the next move is never blocked.
const VIEWPORT = { width: 390, height: 844 };

const SUMMARY = {
  exp: 100,
  materials: { '骨片': 2 },
  firstKillMaterials: { '獣の牙': 1 },
  bonusTickets: 0,
  items: [],
  levelUps: [{ name: 'ヴァンガード', levelBefore: 1, level: 2, maxHpBefore: 20, maxHp: 25 }]
};

async function playVictory(page, summary) {
  await page.evaluate(async (victorySummary) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { playBattleLogs } = await import('/src/combat_ui/battle_log_player.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.gameState = 'combat';
    state.combatState = {
      phase: 'resolving',
      isAuto: false,
      monsters: [{ name: 'ワーウルフ', level: 1, hp: 0, maxHp: 10, spriteType: 'wolf' }]
    };
    updateUI();
    state.transitioning = true;
    playBattleLogs([
      { msg: '戦闘に勝利した！戦闘経験を積んだ。', victorySummary },
      { msg: '周囲に静寂が戻った。', endCombat: true }
    ], 0);
  }, summary);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
});

test('victory band lists rewards and level-up stats, and a tap closes it @smoke', async ({ page }, testInfo) => {
  await playVictory(page, SUMMARY);
  const toast = page.locator('#victory-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText('勝利！ レベルアップ');
  await expect(toast).toContainText('経験値 +100');
  await expect(toast).toContainText('素材 骨片 x2');
  await expect(toast).toContainText('初討伐 獣の牙 x1');
  await expect(toast).toContainText('ヴァンガード Lv1 → Lv2');
  await expect(toast).toContainText('最大HP 20 → 25（+5）');

  const box = await toast.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORT.width);
  expect(box.height).toBeGreaterThanOrEqual(44);

  await testInfo.attach('victory-toast-390x844', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });

  await toast.click();
  await expect(toast).toBeHidden();
  await expect.poll(() => page.evaluate(async () => (await import('/src/state.js')).state.gameState))
    .toBe('explore');
});

test('victory band without level-up auto-hides @smoke', async ({ page }) => {
  await playVictory(page, { ...SUMMARY, firstKillMaterials: {}, levelUps: [] });
  const toast = page.locator('#victory-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(/^勝利！経験値 \+100素材 骨片 x2$/);
  await expect(toast).toBeHidden({ timeout: 5000 });
});
