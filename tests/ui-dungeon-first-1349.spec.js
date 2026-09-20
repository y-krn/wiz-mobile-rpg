import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };

async function seedDungeonState(page, gameState) {
  await page.evaluate(async (nextGameState) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = nextGameState;
    state.transitioning = false;
    state.combatState = nextGameState === 'combat'
      ? {
          phase: 'choose_actions',
          monsters: [{ name: '検証敵', level: 1, hp: 10, maxHp: 10, color: '#00e5ff', spriteType: 'biter' }],
        }
      : null;
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer?.draw?.();
  }, gameState);
  await page.waitForTimeout(150);
}

async function readDungeonFirstLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON() || null;
    const container = document.querySelector('#game-container');
    const visibleButtons = Array.from(document.querySelectorAll('#controls-panel button'))
      .filter((button) => getComputedStyle(button).display !== 'none' && !button.hidden)
      .map((button) => ({ id: button.id, rect: button.getBoundingClientRect().toJSON() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0)
    return {
      classes: container.className,
      dungeonState: container.dataset.dungeonFirstState || null,
      viewport: rect('#viewport-panel'),
      canvas: rect('#dungeon-canvas'),
      viewportLabel: document.querySelector('#viewport-panel')?.getAttribute('aria-label'),
      viewportHudLive: document.querySelector('#viewport-hud')?.getAttribute('aria-live'),
      header: rect('#game-header'),
      goal: rect('#goal-banner'),
      log: rect('#log-panel'),
      controls: rect('#controls-panel'),
      character: rect('#character-panel'),
      buttons: visibleButtons,
      scrollWidth: document.documentElement.scrollWidth,
      reducedMotionRule: getComputedStyle(document.querySelector('#controls-panel')).transitionDuration,
      visualHierarchy: {
        viewportBackground: getComputedStyle(document.querySelector('#viewport-panel')).backgroundImage,
        headerBorderBottom: getComputedStyle(document.querySelector('#game-header')).borderBottomWidth,
        goalBorderLeft: getComputedStyle(document.querySelector('#goal-banner')).borderLeftWidth,
        goalBorderRight: getComputedStyle(document.querySelector('#goal-banner')).borderRightWidth,
        controlsBorderTop: getComputedStyle(document.querySelector('#controls-panel')).borderTopWidth,
        controlsBorderBottom: getComputedStyle(document.querySelector('#controls-panel')).borderBottomWidth,
        controlsBackground: getComputedStyle(document.querySelector('#controls-panel')).backgroundImage,
        forwardShadow: getComputedStyle(document.querySelector('#btn-move-forward')).boxShadow,
        secondaryShadow: getComputedStyle(document.querySelector('#btn-inspect')).boxShadow,
      },
    };
  });
}

function expectDungeonFirstShell(layout, state, viewport = VIEWPORT) {
  expect(layout.classes).toContain('dungeon-first-mode');
  expect(layout.dungeonState).toBe(state);
  expect(layout.viewport.top).toBeLessThanOrEqual(1);
  expect(layout.viewport.height).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(layout.canvas).toMatchObject({ x: layout.viewport.x, y: layout.viewport.y });
  expect(layout.canvas.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(layout.canvas.height).toBeGreaterThanOrEqual(viewport.height - 2);
  expect(layout.viewportLabel).toBe('迷宮の視界');
  expect(layout.viewportHudLive).toBe('polite');
  expect(layout.scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
  expect(layout.header.top).toBeGreaterThanOrEqual(0);
  expect(layout.goal.right).toBeLessThanOrEqual(viewport.width + 1);
  expect(layout.controls.bottom).toBeLessThanOrEqual(layout.character.top + 1);
  for (const button of layout.buttons) {
    expect(button.rect.width, `${state} ${button.id} width`).toBeGreaterThanOrEqual(44);
    expect(button.rect.height, `${state} ${button.id} height`).toBeGreaterThanOrEqual(44);
  }
}

for (const renderer of ['pixi']) {
  test(`Dungeon First keeps Explore dominant at 390x844 with ${renderer} @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`/?renderer=${renderer}`);
    await seedDungeonState(page, 'explore');
    await expect(page.locator('#dungeon-canvas')).toBeVisible();

    const layout = await readDungeonFirstLayout(page);
    expectDungeonFirstShell(layout, 'explore');
    expect(layout.visualHierarchy.viewportBackground).toContain('radial-gradient');
    expect(layout.visualHierarchy.headerBorderBottom).toBe('0px');
    expect(layout.visualHierarchy.goalBorderLeft).toBe('1px');
    expect(layout.visualHierarchy.goalBorderRight).toBe('0px');
    expect(layout.visualHierarchy.controlsBorderTop).toBe('0px');
    expect(layout.visualHierarchy.controlsBorderBottom).toBe('0px');
    expect(layout.visualHierarchy.controlsBackground).toContain('linear-gradient');
    expect(layout.visualHierarchy.forwardShadow).not.toBe('none');
    expect(layout.visualHierarchy.secondaryShadow).toBe('none');
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`issue-1349-${renderer}-explore-390.png`), fullPage: true });
    await testInfo.attach(`issue-1349-${renderer}-explore-390`, { body: screenshot, contentType: 'image/png' });
  });

  test(`Dungeon First keeps Combat contextual at 390x844 with ${renderer} @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`/?renderer=${renderer}`);
    await seedDungeonState(page, 'combat');
    await expect(page.locator('#combat-controls')).toBeVisible();

    const layout = await readDungeonFirstLayout(page);
    expectDungeonFirstShell(layout, 'combat');
    expect(layout.controls.height).toBeLessThan(VIEWPORT.height * 0.5);
    expect(layout.log).not.toBeNull();
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`issue-1349-${renderer}-combat-390.png`), fullPage: true });
    await testInfo.attach(`issue-1349-${renderer}-combat-390`, { body: screenshot, contentType: 'image/png' });
  });
}

test('Dungeon First keeps loot decision over the world at 390x844 @visual', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/');
  await seedDungeonState(page, 'chest');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openChestMenu } = await import('/src/chest.js');
    state.chestState = {
      x: state.x,
      y: state.y,
      trap: 'none',
      identifiedTrap: 'none',
      inspected: true,
      inspectChance: 1,
      item: 'HEAL_POTION',
      lootHint: { label: '古い魔力', aura: 'medium' },
    };
    openChestMenu();
  });
  await expect(page.getByRole('button', { name: '宝箱を開ける' })).toBeVisible();

  const layout = await readDungeonFirstLayout(page);
  expectDungeonFirstShell(layout, 'decision');
  expect(layout.controls.top).toBeGreaterThan(0);
  expect(layout.controls.bottom).toBeLessThanOrEqual(VIEWPORT.height);
  expect(layout.log).not.toBeNull();
  const screenshot = await page.screenshot({ path: testInfo.outputPath('issue-1349-loot-390.png'), fullPage: true });
  await testInfo.attach('issue-1349-loot-390', { body: screenshot, contentType: 'image/png' });
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 430, height: 932 },
]) {
  test(`Dungeon First keeps safe-area controls reachable at ${viewport.width}x${viewport.height} @visual`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await seedDungeonState(page, 'explore');
    const layout = await readDungeonFirstLayout(page);
    expectDungeonFirstShell(layout, 'explore', viewport);
    expect(layout.character.bottom).toBeLessThanOrEqual(viewport.height + 1);
  });
}
