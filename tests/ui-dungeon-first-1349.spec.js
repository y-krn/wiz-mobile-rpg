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
        controlsBackgroundColor: getComputedStyle(document.querySelector('#controls-panel')).backgroundColor,
        forwardBackground: getComputedStyle(document.querySelector('#btn-move-forward')).backgroundImage,
        forwardShadow: getComputedStyle(document.querySelector('#btn-move-forward')).boxShadow,
        secondaryBackground: getComputedStyle(document.querySelector('#btn-inspect')).backgroundImage,
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
    // The Action Dock is a readable bottom sheet over the world, and forward
    // is the single filled primary tile; secondary tiles stay unfilled.
    expect(layout.visualHierarchy.controlsBackgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(layout.visualHierarchy.forwardBackground).toContain('linear-gradient');
    expect(layout.visualHierarchy.forwardShadow).not.toBe('none');
    expect(layout.visualHierarchy.secondaryBackground).toBe('none');
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

// Mobile Safari with both toolbars leaves ~780px of height, which is where a
// bottom-anchored combat strip used to land on top of the enemy sprite.
for (const viewport of [VIEWPORT, { width: 440, height: 780 }, { width: 375, height: 560 }]) {
  test(`Dungeon First combat strip does not cover enemies at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await seedDungeonState(page, 'combat');
    await expect(page.locator('#combat-controls')).toBeVisible();

    const log = await page.locator('#log-panel').boundingBox();
    expect(log).not.toBeNull();
    const enemyRegions = await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const { getCombatMonsterLayout } = await import('/src/rules/renderer_projection.js');
      return getCombatMonsterLayout(state.combatState.monsters, dungeonRenderer.viewport)
        .map(({ hitRegion }) => hitRegion);
    });
    expect(enemyRegions.length).toBeGreaterThan(0);
    for (const region of enemyRegions) {
      const overlaps = log.y + log.height > region.y && log.y < region.y + region.height;
      expect(overlaps, `log ${JSON.stringify(log)} vs enemy ${JSON.stringify(region)}`).toBe(false);
    }
  });
}

const LONG_RECENT_LINE = '[戦果解決] 古びたレザーアーマー（未鑑定）を持ち帰り候補として確保した。重量に注意して帰還を検討しよう';

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// Rendered Pixi bounds are in canvas space; shift them into page space.
async function readRenderedBounds(page, layerName) {
  return page.evaluate(async (layerName) => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    return dungeonRenderer.layer(layerName).children
      .map(child => child.getBounds())
      .filter(bounds => bounds.width > 0 && bounds.height > 0)
      .map(({ x, y, width, height }) => ({ x: canvas.x + x, y: canvas.y + y, width, height }));
  }, layerName);
}

async function seedExploreWithChestAhead(page) {
  await seedDungeonState(page, 'explore');
  await page.evaluate(async (recentLine) => {
    const { state, addLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    state.map.forEach(row => row.forEach(cell => {
      cell.event = null;
      if (cell.type !== 'empty') cell.type = 'empty';
    }));
    const here = state.map[state.y][state.x];
    const ahead = state.map[state.y - 1][state.x];
    state.dir = 0;
    here.walls[0] = false;
    ahead.walls[2] = false;
    ahead.event = 'chest';
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.currentRun.eventObservations = {
      threat: { key: 'threat', lifecycle: 'active', kind: 'threat', text: '奥から重い足音が近づいている', scope: 'floor' },
    };
    addLog(recentLine);
    updateUI();
    dungeonRenderer.lastSignature = null;
    dungeonRenderer.draw();
  }, LONG_RECENT_LINE);
  await page.waitForTimeout(150);
}

async function readEventStrip(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#log-panel').getBoundingClientRect();
    const items = Array.from(document.querySelectorAll('#log-content .event-strip-item'))
      .filter(item => getComputedStyle(item).display !== 'none')
      .map(item => {
        const rect = item.getBoundingClientRect();
        return {
          kind: item.dataset.eventKind,
          label: item.querySelector('.event-strip-item-label')?.textContent,
          text: item.textContent,
          textOverflow: getComputedStyle(item).textOverflow,
          fitsWidth: item.scrollWidth <= item.clientWidth + 1,
          insidePanel: rect.top >= panel.top - 1 && rect.bottom <= panel.bottom + 1,
        };
      });
    return { items, expandVisible: Boolean(document.querySelector('#btn-log-expand')?.checkVisibility()) };
  });
}

// The event strip lives in the ceiling band, so the world object one cell
// ahead stays visible and the latest line wraps instead of ending in "…".
for (const viewport of [VIEWPORT, { width: 360, height: 800 }, { width: 430, height: 932 }, { width: 320, height: 568 }]) {
  test(`Dungeon First event strip keeps world objects and the recent line readable at ${viewport.width}x${viewport.height} @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=pixi');
    await seedDungeonState(page, 'explore');
    const forwardBefore = await page.locator('#btn-move-forward').boundingBox();
    await seedExploreWithChestAhead(page);

    const layout = await readDungeonFirstLayout(page);
    expectDungeonFirstShell(layout, 'explore', viewport);
    const hud = await page.locator('#viewport-hud').boundingBox();
    const minimap = await page.evaluate(() => document.querySelector('#dungeon-minimap-overlay').getBoundingClientRect().toJSON());
    const worldObjects = await readRenderedBounds(page, 'world-objects');
    expect(worldObjects.length).toBeGreaterThan(0);
    for (const object of worldObjects) {
      expect(rectsOverlap(layout.log, object), `log ${JSON.stringify(layout.log)} vs object ${JSON.stringify(object)}`).toBe(false);
      if (viewport === VIEWPORT) {
        for (const [name, rect] of Object.entries({ header: layout.header, goal: layout.goal, hud, minimap, controls: layout.controls, character: layout.character })) {
          expect(rectsOverlap(rect, object), `${name} ${JSON.stringify(rect)} vs object ${JSON.stringify(object)}`).toBe(false);
        }
      }
    }

    // Strip, orientation HUD, minimap, Action Dock and character HUD stack without overlap.
    expect(layout.log.top).toBeGreaterThanOrEqual(layout.goal.bottom);
    expect(hud.y).toBeGreaterThanOrEqual(layout.log.bottom);
    expect(minimap.top).toBeGreaterThanOrEqual(hud.y + hud.height);
    expect(minimap.bottom).toBeLessThanOrEqual(layout.controls.top);
    expect(layout.log.bottom).toBeLessThanOrEqual(layout.controls.top);
    expect(layout.controls.bottom).toBeLessThanOrEqual(layout.character.top + 1);
    expect(await page.locator('#btn-move-forward').boundingBox()).toEqual(forwardBefore);

    const strip = await readEventStrip(page);
    expect(strip.expandVisible).toBe(true);
    expect(strip.items.map(({ kind, label }) => [kind, label])).toEqual([['unresolved', '未解決'], ['transient', '直近']]);
    for (const item of strip.items) {
      expect(item.textOverflow).not.toBe('ellipsis');
      expect(item.fitsWidth, item.text).toBe(true);
      expect(item.insidePanel, item.text).toBe(true);
    }
    expect(strip.items[1].text).toContain(LONG_RECENT_LINE);
  });
}

test('Dungeon First combat strip keeps enemy, name, HP bar and damage text clear at 390x844 @smoke', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi');
  await seedDungeonState(page, 'combat');
  await expect(page.locator('#combat-controls')).toBeVisible();
  await page.evaluate(async (recentLine) => {
    const { addLog } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    addLog(recentLine);
    updateUI();
  }, LONG_RECENT_LINE);

  const log = await page.locator('#log-panel').boundingBox();
  const actors = await readRenderedBounds(page, 'actors');
  // Sprite, shadow, HP bar track, HP fill and name label.
  expect(actors.length).toBeGreaterThanOrEqual(4);
  for (const actor of actors) {
    expect(rectsOverlap(log, actor), `log ${JSON.stringify(log)} vs actor ${JSON.stringify(actor)}`).toBe(false);
  }

  // Damage text rises from its spawn point over its lifetime; check both ends.
  // Draw and measure in one task so the ticker cannot age the text in between.
  for (const age of [0, 39]) {
    const damageTexts = await page.evaluate(async (textAge) => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      const canvas = document.querySelector('#dungeon-canvas').getBoundingClientRect();
      dungeonRenderer.damageTexts = [{ text: '12', color: '#ff3b30', age: textAge, maxAge: 40 }];
      dungeonRenderer.draw();
      return dungeonRenderer.layer('combat-fx').children
        .filter(child => child.text === '12')
        .map(child => child.getBounds())
        .map(({ x, y, width, height }) => ({ x: canvas.x + x, y: canvas.y + y, width, height }));
    }, age);
    expect(damageTexts).toHaveLength(1);
    expect(rectsOverlap(log, damageTexts[0]), `log ${JSON.stringify(log)} vs damage ${JSON.stringify(damageTexts[0])} at age ${age}`).toBe(false);
  }

  const strip = await readEventStrip(page);
  const recent = strip.items.find(({ kind }) => kind === 'transient');
  expect(recent?.text).toContain(LONG_RECENT_LINE);
  expect(recent.insidePanel).toBe(true);
  expect(recent.fitsWidth).toBe(true);
});

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
