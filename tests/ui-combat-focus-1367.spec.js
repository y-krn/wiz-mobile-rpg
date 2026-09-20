import { test, expect } from './fixtures/browser-health.js';

const COMBAT_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 430, height: 932 },
];

async function seedCombat(page, renderer = 'pixi') {
  await page.goto(`/?renderer=${renderer}`);
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('arcana'), createStartingKitCharacter('vanguard')];
    state.party[0].mp = state.party[0].maxMp = 10;
    state.currentRun = createDefaultCurrentRun();
    state.inventory = ['HEAL_POTION'];
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    })));
    state.maps[0] = state.map;
    state.visitedMap = state.map.map(row => row.map(() => true));
    state.visitedMaps[0] = state.visitedMap;
    state.logs = ['古い記録 1', '古い記録 2', '戦闘開始'];
    state.gameState = 'combat';
    state.transitioning = false;
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '検証敵', level: 1, hp: 80, maxHp: 100, magicResist: 0, color: '#ff3b30', spriteType: 'biter', tags: [] },
        { name: '検証敵 B', level: 1, hp: 60, maxHp: 60, magicResist: 0, color: '#00e5ff', spriteType: 'kobold', tags: [] },
      ],
      roundNumber: 1,
      isAuto: false,
      pendingOutcome: null,
      lastActions: null,
    };
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', itemKey: '', itemIdx: -1, prevGameState: null });
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer?.draw?.();
  });
  await page.waitForTimeout(100);
}

async function attachScreenshot(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  const screenshot = await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });
}

async function expectCombatFocus(page, height = 844) {
  await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'choose_action');
  await expect(page.locator('#goal-banner')).toBeHidden();
  await expect(page.locator('#goal-banner')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#viewport-hud')).not.toContainText('方角:');
  await expect(page.locator('#combat-prompt')).toContainText('行動を選択');
  await expect(page.locator('#btn-combat-fight')).toBeVisible();
  await expect(page.locator('#btn-combat-spell')).toBeVisible();
  await expect(page.locator('#btn-combat-item')).toBeVisible();
  await expect(page.locator('#btn-combat-defend')).toBeVisible();
  await expect(page.locator('#btn-combat-run')).toBeVisible();
  await expect(page.locator('#btn-combat-repeat')).toBeHidden();
  await expect(page.locator('#btn-combat-cancel')).toBeHidden();
  await expect(page.locator('#character-hud')).toContainText('HP');
  await expect(page.locator('#character-hud')).toContainText('MP');
  const layout = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    combatButtons: [...document.querySelectorAll('#combat-controls .btn')]
      .filter(button => getComputedStyle(button).display !== 'none' && !button.hidden)
      .map(button => button.getBoundingClientRect().toJSON()),
    viewport: document.querySelector('#viewport-panel').getBoundingClientRect().toJSON(),
    canvas: document.querySelector('#dungeon-canvas').getBoundingClientRect().toJSON(),
  }));
  expect(layout.overflow).toBe(false);
  expect(layout.combatButtons).toHaveLength(5);
  for (const button of layout.combatButtons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.bottom).toBeLessThanOrEqual(height + 1);
  }
  expect(layout.canvas.width).toBeGreaterThanOrEqual(layout.viewport.width - 1);
  expect(layout.canvas.height).toBeGreaterThanOrEqual(layout.viewport.height - 1);
}

for (const renderer of ['pixi']) {
  test(`Combat Focus ${renderer} keeps enemy, actions, and status primary @e2e @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedCombat(page, renderer);
    await expectCombatFocus(page);
    await expect(page.locator('#viewport-hud .combat-enemy-semantic')).toHaveCount(1);
    await attachScreenshot(page, testInfo, `issue-1367-${renderer}-choose-action-390`);

    await page.locator('#btn-combat-fight').click();
    await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'choose_target');
    await expect(page.locator('#combat-controls')).toBeHidden();
    await expect(page.locator('#combat-overlay .btn-combat-back')).toBeVisible();
    await attachScreenshot(page, testInfo, `issue-1133-${renderer}-choose-target-390`);

    await page.locator('#combat-overlay .btn-combat-back').click();
    await expectCombatFocus(page);
    await page.locator('#btn-combat-spell').click();
    await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'choose_spell');
    await expect(page.locator('#combat-overlay .combat-item-card.spell').first()).toBeVisible();
    await attachScreenshot(page, testInfo, `issue-1367-${renderer}-choose-spell-390`);

    await page.locator('#combat-overlay .btn-combat-back').click();
    await expectCombatFocus(page);
    await page.locator('#btn-combat-item').click();
    await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'choose_item');
    await expect(page.locator('#combat-overlay .combat-item-card.item').first()).toBeVisible();
    await attachScreenshot(page, testInfo, `issue-1367-${renderer}-choose-item-390`);

    await page.locator('#combat-overlay .btn-combat-back').click();
    await expectCombatFocus(page);
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      state.combatState.phase = 'resolving';
      state.transitioning = true;
      updateUI();
      const { dungeonRenderer } = await import('/src/renderer.js');
      dungeonRenderer?.draw?.();
    });
    await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'resolving');
    await expect(page.locator('#combat-prompt')).toHaveText('ターン解決中...');
    await expect(page.locator('#btn-combat-fight')).toHaveCSS('opacity', '0.3');
    await attachScreenshot(page, testInfo, `issue-1367-${renderer}-resolving-390`);
  });
}

test('Combat Focus preserves Pixi keyboard back and focus restoration @e2e @smoke', async ({ page }) => {
  for (const renderer of ['pixi']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedCombat(page, renderer);
    await page.locator('#btn-combat-fight').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'choose_target');
    await page.locator('#combat-overlay .combat-target-a11y').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#combat-overlay')).toBeHidden();
    await expect(page.locator('#btn-combat-fight')).toBeFocused();
  }
});

test('Combat-only exploration suppression restores Explore information @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCombat(page, 'pixi');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'explore';
    state.combatState = null;
    state.transitioning = false;
    updateUI();
  });
  await expect(page.locator('#goal-banner')).toBeVisible();
  await expect(page.locator('#goal-banner')).toHaveAttribute('aria-hidden', 'false');
  await expect(page.locator('#viewport-hud')).toContainText('方角:');
});

for (const viewport of COMBAT_VIEWPORTS) {
  test(`Combat Focus responsive decision surface ${viewport.width}x${viewport.height} @e2e @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await seedCombat(page, 'pixi');
    await expectCombatFocus(page, viewport.height);
    await attachScreenshot(page, testInfo, `issue-1367-pixi-choose-action-${viewport.width}x${viewport.height}`);
    await page.locator('#btn-combat-fight').click();
    await expect(page.locator('#game-container')).toHaveAttribute('data-combat-phase', 'choose_target');
    await expect(page.locator('#combat-overlay .btn-combat-back')).toBeVisible();
    await attachScreenshot(page, testInfo, `issue-1133-canvas-choose-target-${viewport.width}x${viewport.height}`);
  });
}
