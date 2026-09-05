import { test, expect } from './fixtures/browser-health.js';

test('HEAL_POTION use in the explore menu returns to the usable item list @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();

  // 1. ブラウザコンテキスト内でソロ状態を初期化してダンジョンに入る
  await page.evaluate(async () => {
    const stateMod = await import('/src/state.js');
    const moveMod = await import('/src/movement.js');
    const uiMod = await import('/src/ui.js');
    
    // ニューゲームの初期状態をロード
    stateMod.initNewGame();
    stateMod.state.party = [stateMod.createSoloCharacter('Fighter')];
    
    // ダンジョンに入る
    moveMod.executeEnterDungeon(1);
    
    // バッグに HEAL_POTION を追加
    stateMod.state.inventory.push("HEAL_POTION");
    // パーティ先頭キャラの HP を減らす
    stateMod.state.party[0].hp = 5;
    
    // UI を更新
    uiMod.updateUI();
  });

  // HUD (body) に Arthur の HP が 5 であることを示すテキスト ("H 5" または "HP: 5" 等) が含まれていることを確認
  const body = page.locator('body');
  await expect(body).toContainText('Arthur');
  await expect(body).toContainText('5/20');

  // 2. 「調べる」（実際には「道具」を起動するボタン）をクリック
  const inspectBtn = page.locator('#btn-inspect');
  await expect(inspectBtn).toBeVisible();
  await inspectBtn.click();
  await expect(page.locator('#submenu-controls')).toBeVisible();

  // 3. 「傷薬 (ディオス薬)」を選択
  const potionBtns = page.locator('button:has-text("傷薬 (ディオス薬)")');
  // executeEnterDungeon()の開始数に、テストで追加した1個を足した数
  const initialPotionCount = await potionBtns.count();
  expect(initialPotionCount).toBeGreaterThan(0);
  await potionBtns.first().click();

  // 4. 対象キャラクター (Arthur) をタップ
  const targetBtn = page.locator('button:has-text("Arthur")').first();
  await expect(targetBtn).toBeVisible();
  await targetBtn.click();

  // 5. 回復結果の確認
  // Arthur の HP が 20 に回復しているか ("H 20")
  await expect(body).toContainText('20/20');

  // ログに回復メッセージが出ているか
  await expect(body).toContainText('Arthurは傷薬を使い、HPが15回復した。');

  // 使用後、対象選択画面に残らず、元のバッグ一覧に戻って個数が1つ減ることを確認
  await expect(potionBtns).toHaveCount(initialPotionCount - 1);
});
