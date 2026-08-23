import { test, expect } from './fixtures/browser-health.js';
import { VIEWPORTS } from './ui-ux-helpers.js';

for (const vp of VIEWPORTS) {
  test(`abandon run confirmation is cancelable and death-equivalent at ${vp.width}x${vp.height} @e2e @smoke`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.locator('#btn-town-dungeon').click();
    await page.getByRole('button', { name: /戦士/ }).click();
    await page.getByRole('button', { name: /B1Fから開始/ }).click();
    await expect(page.locator('#btn-abandon-run')).toHaveCount(0);
    await expect(page.locator('#explore-controls .action-grid button')).toHaveText([
      '道具', '呪文', '装備', '冒険管理'
    ]);
    const actionLayout = await page.locator('#explore-controls .action-grid button').evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { id: button.id, height: rect.height, tabIndex: button.tabIndex };
    }));
    expect(actionLayout).toEqual([
      { id: 'btn-inspect', height: 44, tabIndex: 0 },
      { id: 'btn-cast', height: 44, tabIndex: 0 },
      { id: 'btn-item', height: 44, tabIndex: 0 },
      { id: 'btn-explore-management', height: 44, tabIndex: 0 },
    ]);
    await page.locator('#btn-turn-left').focus();
    const focusOrder = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      focusOrder.push(await page.evaluate(() => document.activeElement?.id));
    }
    expect(focusOrder).toEqual([
      'btn-move-forward', 'btn-turn-right', 'btn-move-backward', 'btn-search',
      'btn-inspect', 'btn-cast', 'btn-item', 'btn-explore-management',
    ]);

    await page.locator('#btn-explore-management').click();
    await expect(page.locator('#submenu-title')).toHaveText('冒険管理');
    await expect(page.locator('#btn-abandon-run')).toBeVisible();
    await expect(page.locator('#btn-submenu-back')).toBeVisible();
    const managementOrder = await page.locator('#submenu-controls button:visible').evaluateAll((buttons) => buttons.map((button) => button.id));
    expect(managementOrder).toEqual(['btn-abandon-run', 'btn-submenu-back']);
    await page.locator('#btn-abandon-run').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('btn-submenu-back');

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
    await expect(page.locator('#submenu-controls')).toBeVisible();
    const afterCancel = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      return {
        gameState: state.gameState,
        reason: state.currentRun.returnReason,
        runs: state.records.totalRuns,
        materials: state.currentRun.materials,
        equipmentFound: state.currentRun.equipmentFound,
        deepestFloor: state.currentRun.deepestFloor,
      };
    });
    expect(afterCancel).toEqual({
      gameState: 'submenu',
      reason: '',
      runs: 0,
      materials: { '獣の牙': 10 },
      equipmentFound: [{ baseId: 'SHORT_SWORD' }],
      deepestFloor: 4,
    });

    await page.locator('#btn-submenu-back').click();
    await expect(page.locator('#explore-controls')).toBeVisible();

    await page.locator('#btn-explore-management').click();
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
