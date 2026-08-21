import { test, expect } from '@playwright/test';
import { VIEWPORTS } from './ui-ux-helpers.js';

for (const vp of VIEWPORTS) {
  test(`abandon run confirmation is cancelable and death-equivalent at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.locator('#btn-town-dungeon').click();
    await page.getByRole('button', { name: /戦士/ }).click();
    await page.getByRole('button', { name: /B1Fから開始/ }).click();
    await expect(page.locator('#btn-abandon-run')).toBeVisible();

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.currentRun.materials = { '獣の牙': 10 };
      state.currentRun.equipmentFound = [{ baseId: 'SHORT_SWORD' }];
      state.currentRun.deepestFloor = 4;
    });

    let cancelMessage = '';
    page.once('dialog', async dialog => {
      cancelMessage = dialog.message();
      await dialog.dismiss();
    });
    await page.locator('#btn-abandon-run').click();
    expect(cancelMessage).toContain('死亡時と同じ扱い');
    await expect(page.locator('#explore-controls')).toBeVisible();
    const afterCancel = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return { gameState: state.gameState, reason: state.currentRun.returnReason, runs: state.records.totalRuns };
    });
    expect(afterCancel).toEqual({ gameState: 'explore', reason: '', runs: 0 });

    page.once('dialog', dialog => dialog.accept());
    await page.locator('#btn-abandon-run').click();
    await expect(page.locator('#result-overlay')).toBeVisible();
    const afterConfirm = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return {
        gameState: state.gameState,
        reason: state.currentRun.returnReason,
        banked: state.currentRun.bankedMaterials['獣の牙'],
        totalRuns: state.records.totalRuns,
        totalDeaths: state.codex.stats.totalDeaths,
        deathLogs: state.deathLogs.length,
        historyReason: state.runHistory[0].returnReason,
        characterStatus: state.party[0].status,
      };
    });
    expect(afterConfirm).toEqual({
      gameState: 'result',
      reason: 'abandon',
      banked: 3,
      totalRuns: 1,
      totalDeaths: 0,
      deathLogs: 0,
      historyReason: 'abandon',
      characterStatus: 'ok',
    });
  });
}
