import { test, expect } from './fixtures/browser-health.js';

test('Combat Auto button exposes its active state @e2e @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await expect(page.locator('#btn-town-dungeon')).toBeVisible();

  // 1. クラスを選び、単独で迷宮に入る
  const enterBtn = page.locator('#btn-town-dungeon');
  await enterBtn.click();
  await page.getByRole('button', { name: /戦士/ }).click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();

  // 強制的に戦闘を開始する
  await page.evaluate(async () => {
    const { startCombat } = await import('/src/combat.js');
    startCombat(false, false);
  });
  // 戦闘に入ったことを確認
  const combatPrompt = page.locator('#combat-prompt');
  await expect(combatPrompt).toBeVisible();

  // 戦闘に入ったら、オートボタンのテキストとクラスを確認
  const autoBtn = page.locator('#btn-combat-auto');
  const text = (await autoBtn.textContent()).trim();
  const className = await autoBtn.getAttribute('class');
  
  console.log(`Combat Auto Button at start - Text: "${text}", Class: "${className}"`);
  
  // 初期状態では「オート」であるべき
  expect(text).toBe('オート');
  expect(className).not.toContain('active');

  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.combatState.isAuto = true;
    updateUI();
  });
  await expect(autoBtn).toHaveClass(/active/);
  await expect.poll(() => autoBtn.evaluate((element) => getComputedStyle(element).borderColor))
    .toBe('rgb(0, 255, 102)');
});

test('Canceled combat choices do not emit decision telemetry @e2e @smoke', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.locator('#btn-town-dungeon').click();
  await page.getByRole('button', { name: /戦士/ }).click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await page.getByRole('button', { name: '迷宮へ向かう' }).click();

  const result = await page.evaluate(async () => {
    const { state, createSoloCharacter } = await import('/src/state.js');
    const { startCombat, selectCombatAction, cancelCombatAction } = await import('/src/combat.js');
    const { combatCallbacks, combatSelection } = await import('/src/combat_ui/combat_state.js');
    const { __setTelemetryClientForTests, trackRunStart } = await import('/src/telemetry.js');

    const events = [];
    __setTelemetryClientForTests({ capture: (name, properties) => events.push({ name, properties }) });
    state.party = [state.party[0], createSoloCharacter('Mage')];
    trackRunStart(state.currentRun, state.party[0], state);
    startCombat(false, false);
    combatSelection.charIdx = 0;
    combatSelection.actions = [];

    selectCombatAction('fight');
    combatCallbacks.activeTargetCallback(0);
    const selected = {
      actionCount: combatSelection.actions.length,
      charIdx: combatSelection.charIdx
    };

    cancelCombatAction();
    return {
      selected,
      canceled: {
        actionCount: combatSelection.actions.length,
        charIdx: combatSelection.charIdx
      },
      decisions: events.filter(event => event.name === 'combat_decision'),
    };
  });

  expect(result.selected).toEqual({ actionCount: 1, charIdx: 1 });
  expect(result.canceled).toEqual({ actionCount: 0, charIdx: 0 });
  expect(result.decisions).toEqual([]);
});

const COMBAT_OVERLAY_VIEWPORTS = [
  { width: 360, height: 800, name: 'Galaxy S20' },
  { width: 390, height: 844, name: 'iPhone 13' },
  { width: 430, height: 932, name: 'iPhone 14 Pro Max' },
];

for (const vp of COMBAT_OVERLAY_VIEWPORTS) {
  test(`Combat selection overlays fit mobile width on ${vp.name} @visual`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.goto('/');
    await expect(page.locator('#btn-town-dungeon')).toBeVisible();

    await page.evaluate(async () => {
      const { state, createSoloCharacter } = await import('/src/state.js');
      const { startCombat } = await import('/src/combat.js');
      state.party = [createSoloCharacter('Priest')];
      state.inventory = ['HEAL_POTION'];
      state.gameState = 'explore';
      state.floor = 1;
      startCombat(false, false);
    });

    const verifyCombatOverlay = async (actionButtonId, overlayType) => {
      await page.locator(actionButtonId).click();
      await expect(page.locator('#combat-overlay')).toBeVisible();
      await expect(page.locator(`body:has(#combat-overlay[style*="flex"])`)).toBeVisible();
      await expect(page.locator('#controls-panel .controls-group.active')).toHaveCount(0);

      const metrics = await page.evaluate((type) => {
        const viewportWidth = document.documentElement.clientWidth;
        const overlay = document.getElementById('combat-overlay');
        const back = overlay.querySelector('.btn-combat-back');
        const backRect = back.getBoundingClientRect();
        const visibleOverflow = Array.from(overlay.querySelectorAll('*'))
          .filter((el) => {
            const style = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              rect.width > 0 &&
              rect.height > 0 &&
              (rect.left < -1 || rect.right > viewportWidth + 1);
          })
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return { tag: el.tagName.toLowerCase(), className: el.className, left: rect.left, right: rect.right };
          });
        return {
          type,
          title: overlay.querySelector('.combat-overlay-title')?.textContent,
          backHeight: backRect.height,
          overflowCount: visibleOverflow.length,
          visibleOverflow,
        };
      }, overlayType);

      expect(metrics.title, `${overlayType} should render a title on ${vp.name}`).toBeTruthy();
      expect(metrics.backHeight, `${overlayType} back button should be tappable on ${vp.name}`).toBeGreaterThanOrEqual(44);
      expect(metrics.overflowCount, `${overlayType} should not overflow horizontally on ${vp.name}: ${JSON.stringify(metrics.visibleOverflow)}`).toBe(0);

      await page.locator('#combat-overlay .btn-combat-back').click();
      await expect(page.locator('#combat-overlay')).toBeHidden();
      await expect(page.locator('#combat-controls')).toBeVisible();
    };

    await verifyCombatOverlay('#btn-combat-fight', 'combat_target');
    await verifyCombatOverlay('#btn-combat-spell', 'combat_spell');
    await verifyCombatOverlay('#btn-combat-item', 'combat_item');
  });
}
