import { test, expect } from './fixtures/browser-health.js';

test('Explore and Combat share the common Dock grammar at 320x568 @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /戦士/ }).click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();

  const explore = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return {
      forward: document.querySelector('#btn-move-forward')?.textContent.trim(),
      bag: document.querySelector('#btn-inspect')?.textContent.trim(),
      magic: document.querySelector('#btn-cast')?.textContent.trim(),
      dockState: document.querySelector('#controls-panel')?.dataset.dockState,
      before: { x: state.x, y: state.y },
    };
  });

  expect(explore).toMatchObject({
    forward: '進む',
    bag: 'バッグ',
    magic: '魔法',
    dockState: 'compact',
  });

  await page.locator('#dungeon-canvas').click({ position: { x: 16, y: 16 } });
  const afterCanvasTap = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { x: state.x, y: state.y };
  });
  expect(afterCanvasTap).toEqual(explore.before);

  await page.evaluate(async () => {
    const { startCombat } = await import('/src/combat.js');
    startCombat(false, false);
  });

  await expect(page.locator('#combat-controls')).toBeVisible();
  await expect(page.locator('#btn-combat-auto')).toBeHidden();
  await expect(page.locator('#btn-combat-repeat')).toBeDisabled();
  await expect(page.locator('#controls-panel')).toHaveAttribute('data-dock-state', 'decision');

  await page.locator('#btn-combat-fight').click();
  await expect(page.locator('#combat-overlay')).toBeVisible();
  await expect(page.locator('#combat-overlay .combat-target-card').first()).toBeVisible();
  await expect(page.locator('#combat-overlay .combat-target-card').first()).toHaveAttribute('type', 'button');
  await expect(page.locator('#combat-overlay .btn-combat-back')).toHaveAttribute('data-action-role', 'back');

  const overlayParent = await page.locator('#combat-overlay').evaluate(element => element.parentElement?.id);
  expect(overlayParent).toBe('controls-panel');

  await page.locator('#combat-overlay .btn-combat-back').click();
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expect(page.locator('#combat-controls')).toBeVisible();
});

test('important combat results remain in the Event Strip with ordinary logs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createSoloCharacter, addEventLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createSoloCharacter('Mage')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    state.currentRun.eventObservations = {
      'trap:test:1': {
        key: 'trap:test:1',
        scope: 'trap:1',
        text: '【痕跡】強敵の近くに罠の気配がある。',
        lifecycle: 'active',
      },
    };
    state.logs = Array.from({ length: 20 }, (_, index) => `通常ログ ${index + 1}`);
    addEventLog('【戦闘結果】反射され、敵にダメージを与えられなかった。', {
      key: 'combat-result:test:1',
      scope: 'combat:test',
      kind: 'result',
    });
    updateUI();
    return {
      resultText: document.querySelector('#log-content [data-event-kind="result"]')?.textContent,
      unresolvedText: document.querySelector('#log-content [data-event-kind="unresolved"]')?.textContent,
      transientCount: document.querySelectorAll('#log-content [data-event-kind="transient"]').length,
    };
  });

  expect(result.resultText).toContain('反射');
  expect(result.unresolvedText).toContain('罠の気配');
  expect(result.transientCount).toBeLessThanOrEqual(8);
});

test('combat result observations are cleared at combat boundaries', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createSoloCharacter, addEventLog } = await import('/src/state.js');
    const { startCombat } = await import('/src/combat.js');
    state.party = [createSoloCharacter('Fighter')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'explore';
    state.transitioning = false;
    addEventLog('【戦闘結果】反射された。', {
      key: 'combat-result:test:boundary',
      scope: 'combat:1',
      kind: 'result',
    });
    const before = Object.values(state.currentRun.eventObservations).filter(entry => entry.kind === 'result' && entry.lifecycle === 'active').length;
    startCombat(false, false);
    const afterCombatStart = Object.values(state.currentRun.eventObservations).filter(entry => entry.kind === 'result' && entry.lifecycle === 'active').length;

    addEventLog('【戦闘結果】無効化された。', {
      key: 'combat-result:test:round',
      scope: 'combat:1',
      kind: 'result',
    });
    const { combatSelection, resolveCombatRound, resumeCombat } = await import('/src/combat.js');
    resumeCombat();
    const afterResume = Object.values(state.currentRun.eventObservations).filter(entry => entry.kind === 'result' && entry.lifecycle === 'active').length;
    combatSelection.actions = [{ type: 'defend', actorIdx: 0 }];
    combatSelection.charIdx = 1;
    resolveCombatRound();
    const afterRoundStart = Object.values(state.currentRun.eventObservations).filter(entry => entry.kind === 'result' && entry.lifecycle === 'active').length;
    return { before, afterCombatStart, afterResume, afterRoundStart };
  });

  expect(result).toEqual({ before: 1, afterCombatStart: 0, afterResume: 1, afterRoundStart: 0 });
});
