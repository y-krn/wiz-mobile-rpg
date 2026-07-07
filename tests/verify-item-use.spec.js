import { test, expect } from '@playwright/test';

test('Verify HEAL_POTION use in explore menu on mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForTimeout(1000);

  // 1. ブラウザコンテキスト内で state を初期化し、パーティを編成してダンジョンに入る
  await page.evaluate(async () => {
    const stateMod = await import('/src/state.js');
    const moveMod = await import('/src/movement.js');
    const uiMod = await import('/src/ui.js');
    
    // ニューゲームの初期状態をロード
    stateMod.initNewGame();
    // ロースターのメンバーをパーティに追加
    stateMod.state.party = stateMod.state.roster.slice(0, 4);
    
    // ダンジョンに入る
    moveMod.enterDungeon();
    
    // バッグに HEAL_POTION を追加
    stateMod.state.inventory.push("HEAL_POTION");
    // パーティ先頭キャラの HP を減らす
    stateMod.state.party[0].hp = 5;
    
    // UI を更新
    uiMod.updateUI();
  });

  await page.waitForTimeout(1000);

  // HUD (body) に Arthur の HP が 5 であることを示すテキスト ("H 5" または "HP: 5" 等) が含まれていることを確認
  const body = page.locator('body');
  await expect(body).toContainText('Arthur');
  await expect(body).toContainText('H 5');

  // 2. 「調べる」（実際には「道具」を起動するボタン）をクリック
  const inspectBtn = page.locator('#btn-inspect');
  await expect(inspectBtn).toBeVisible();
  await inspectBtn.click();
  await page.waitForTimeout(500);

  // 3. 「傷薬 (ディオス薬)」を選択
  const potionBtns = page.locator('button:has-text("傷薬 (ディオス薬)")');
  // 初期状態で3つあることを確認
  await expect(potionBtns).toHaveCount(3);
  await potionBtns.first().click();
  await page.waitForTimeout(500);

  // 4. 対象キャラクター (Arthur) をタップ
  const targetBtn = page.locator('button:has-text("Arthur")').first();
  await expect(targetBtn).toBeVisible();
  await targetBtn.click();
  await page.waitForTimeout(500);

  // 5. 回復結果の確認
  // Arthur の HP が 20 に回復しているか ("H 20")
  await expect(body).toContainText('H 20');

  // ログに回復メッセージが出ているか
  await expect(body).toContainText('Arthurは傷薬を使い、HPが15回復した。');

  // 使用後、対象選択画面に残らず、元のバッグ一覧に戻って個数が減少していることを確認
  // 3つあった「傷薬 (ディオス薬)」が、使用後に2つになっているはず
  await expect(potionBtns).toHaveCount(2);
});
