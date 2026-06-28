import { test, expect } from '@playwright/test';

test('Combat Auto button test', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForTimeout(1000);

  // 1. 訓練場に入ってキャラクターをパーティに追加する
  const trainingBtn = page.locator('#btn-town-training');
  await trainingBtn.click();
  await page.waitForTimeout(500);

  // 6人全員加える
  for (let i = 0; i < 6; i++) {
    const charRow = page.locator('.char-row').nth(i);
    if (await charRow.isVisible()) {
      await charRow.click();
      await page.waitForTimeout(200);
      const addBtn = page.locator('button:has-text("加える"):visible');
      if (await addBtn.isVisible()) {
        await addBtn.click();
        await page.waitForTimeout(200);
      }
    }
  }

  // 街に戻る
  const closeBtn = page.locator('#training-overlay button:has-text("閉じる"):visible');
  await closeBtn.click();
  await page.waitForTimeout(500);

  // 2. 迷宮に入る
  const enterBtn = page.locator('#btn-town-dungeon');
  await enterBtn.click();
  await page.waitForTimeout(500);

  // 強制的に戦闘を開始する
  await page.evaluate(async () => {
    const { startCombat } = await import('/src/combat.js');
    startCombat(false, false);
  });
  await page.waitForTimeout(500);

  // 戦闘に入ったことを確認
  const combatPrompt = page.locator('#combat-prompt');
  expect(await combatPrompt.isVisible()).toBe(true);

  // 戦闘に入ったら、オートボタンのテキストとクラスを確認
  const autoBtn = page.locator('#btn-combat-auto');
  const text = (await autoBtn.textContent()).trim();
  const className = await autoBtn.getAttribute('class');
  
  console.log(`Combat Auto Button at start - Text: "${text}", Class: "${className}"`);
  
  // 初期状態では「オート」であるべき
  expect(text).toBe('オート');
  expect(className).not.toContain('active');
});
