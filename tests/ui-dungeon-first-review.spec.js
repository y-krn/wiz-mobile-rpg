import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };
const ARCHETYPES = ['straight-corridor', 'left-opening', 'right-opening', 't-junction', 'dead-end', 'intersection'];

const PATHS = {
  'straight-corridor': [[4, 4, 0], [4, 3, 0]],
  'left-opening': [[4, 4, 0], [4, 4, 3]],
  'right-opening': [[4, 4, 0], [4, 4, 1]],
  't-junction': [[4, 4, 0], [4, 4, 1], [4, 4, 3]],
  'dead-end': [],
  intersection: [[4, 4, 0], [4, 4, 1], [4, 4, 2], [4, 4, 3]],
};

function makeMap(archetype) {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: 'empty',
  })));
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [x, y, direction] of PATHS[archetype]) {
    const [dx, dy] = directions[direction];
    map[y][x].walls[direction] = false;
    if (map[y + dy]?.[x + dx]) map[y + dy][x + dx].walls[(direction + 2) % 4] = false;
  }
  return map;
}

async function seedDungeon(page, { renderer = 'pixi', gameState = 'explore', map = makeMap('straight-corridor'), floor = 1 } = {}) {
  await page.goto(`/?renderer=${renderer}`);
  if (renderer === 'pixi') await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async ({ gameState, map, floor }) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { combatSelection } = await import('/src/combat.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [
      createStartingKitCharacter(gameState === 'combat' ? 'arcana' : 'vanguard'),
      createStartingKitCharacter('vanguard'),
    ];
    state.currentRun = createDefaultCurrentRun();
    state.floor = floor;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = map;
    state.maps[floor - 1] = map;
    state.visitedMap = map.map(row => row.map(() => true));
    state.visitedMaps[floor - 1] = state.visitedMap;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = gameState;
    state.transitioning = false;
    state.combatState = gameState === 'combat'
      ? { phase: 'choose_actions', monsters: [{ name: '検証敵', level: 1, hp: 100, maxHp: 100, magicResist: 0, color: '#00e5ff', spriteType: 'biter' }] }
      : null;
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
  }, { gameState, map, floor });
  await page.waitForTimeout(100);
}

async function seedPortal(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { openSubmenu } = await import('/src/navigation.js');
    const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
    })));
    map[4][4].walls[0] = false;
    map[3][4].walls[2] = false;
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.currentRun.runSeed = 'PORTAL-1349';
    state.currentRun.unbankedObjectLoot = [{ id: 'loot-1', item: 'GREATER_HEAL' }];
    state.floor = 5;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = map;
    state.maps[4] = map;
    state.visitedMap = map.map(row => row.map(() => true));
    state.visitedMaps[4] = state.visitedMap;
    state.gameState = 'explore';
    state.transitioning = false;
    openSubmenu('milestone_portal', 'B5F帰還の門');
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer?.draw?.();
  });
  await page.waitForTimeout(100);
}

async function canvasTargetPoint(page, index = 0) {
  return page.evaluate(async (monsterIndex) => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    const canvas = document.querySelector('#dungeon-canvas');
    const rect = canvas.getBoundingClientRect();
    const profile = dungeonRenderer.viewport;
    const hitRegion = getCombatMonsterLayout(state.combatState.monsters, profile)[monsterIndex].hitRegion;
    const scale = Math.min(rect.width / profile.width, rect.height / profile.height);
    return {
      x: (hitRegion.centerX * scale) + (rect.width - profile.width * scale) / 2,
      y: (hitRegion.centerY * scale) + (rect.height - profile.height * scale) / 2,
    };
  }, index);
}

async function selectCanvasEnemy(page) {
  const point = await canvasTargetPoint(page);
  await page.locator('#dungeon-canvas').click({ position: point });
}

test('Dungeon First preserves complete navigation surface across six 390x844 topologies @smoke', async ({ page }, testInfo) => {
  for (const renderer of ['pixi']) {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`/?renderer=${renderer}`);
    if (renderer === 'pixi') await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
    await page.locator('#game-header').evaluate(element => { element.style.display = 'none'; });
    await page.locator('#goal-banner').evaluate(element => { element.style.display = 'none'; });
    await page.locator('#log-panel').evaluate(element => { element.style.display = 'none'; });
    await page.locator('#controls-panel').evaluate(element => { element.style.display = 'none'; });
    await page.locator('#character-panel').evaluate(element => { element.style.display = 'none'; });

    for (const archetype of ARCHETYPES) {
      await page.evaluate(async ({ map }) => {
        const { state } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        state.map = map;
        state.maps[0] = map;
        state.visitedMap = map.map(row => row.map(() => true));
        state.visitedMaps[0] = state.visitedMap;
        state.x = 4; state.y = 4; state.dir = 0;
        state.gameState = 'explore';
        state.transitioning = false;
        state.mapRevision = (state.mapRevision || 0) + 1;
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, { map: makeMap(archetype) });
      await page.waitForTimeout(50);
      if (renderer === 'pixi') await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', renderer);
      const metrics = await page.evaluate(() => {
        const canvas = document.querySelector('#dungeon-canvas');
        const viewport = document.querySelector('#viewport-panel');
        const before = getComputedStyle(document.querySelector('#game-container'), '::before');
        const after = getComputedStyle(document.querySelector('#game-container'), '::after');
        return {
          fit: getComputedStyle(canvas).objectFit,
          natural: [canvas.width, canvas.height],
          canvas: canvas.getBoundingClientRect().toJSON(),
          viewport: viewport.getBoundingClientRect().toJSON(),
          safeTop: before.backgroundColor,
          safeBottom: after.backgroundColor,
        };
      });
      expect(metrics.fit).toBe('contain');
      expect(metrics.natural[0]).toBeGreaterThanOrEqual(388);
      expect(metrics.natural[1]).toBeGreaterThanOrEqual(843);
      expect(metrics.canvas.width).toBeGreaterThanOrEqual(388);
      expect(metrics.canvas.height).toBeGreaterThanOrEqual(843);
      expect(metrics.viewport.height).toBeGreaterThanOrEqual(843);
      expect(metrics.safeTop).toBe('rgba(0, 0, 0, 0)');
      expect(metrics.safeBottom).toBe('rgba(0, 0, 0, 0)');
      const screenshot = await page.locator('#viewport-panel').screenshot({ path: testInfo.outputPath(`issue-1349-${renderer}-${archetype}-390.png`) });
      await testInfo.attach(`issue-1349-${renderer}-${archetype}-390`, { body: screenshot, contentType: 'image/png' });
    }
  }
});

for (const renderer of ['pixi']) {
  test(`Dungeon First ${renderer} combat canvas target passes through overlay for fight and spell @smoke`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await seedDungeon(page, { renderer, gameState: 'combat' });
    await page.locator('#btn-combat-fight').click();
    await expect(page.locator('#combat-overlay')).toBeVisible();
    await selectCanvasEnemy(page);
    await expect(page.locator('#combat-overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(async () => (await import('/src/combat.js')).combatSelection.actions[0])).toMatchObject({ type: 'fight', targetIdx: 0 });

    await seedDungeon(page, { renderer, gameState: 'combat' });
    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      state.party[0].mp = state.party[0].maxMp = 10;
      const { updateUI } = await import('/src/ui.js');
      updateUI();
    });
    await page.locator('#btn-combat-spell').click();
    await page.locator('#combat-overlay .combat-item-card.spell', { has: page.locator('.spell-name', { hasText: /^HALITO$/ }) }).click();
    await selectCanvasEnemy(page);
    await expect.poll(() => page.evaluate(async () => (await import('/src/combat.js')).combatSelection.actions[0])).toMatchObject({ type: 'spell', targetIdx: 0, spellName: 'HALITO' });
  });
}

test('Dungeon First keeps minimap clear of HUD, log strip, and controls across phone widths @smoke', async ({ page }, testInfo) => {
  for (const viewport of [{ width: 360, height: 800 }, VIEWPORT, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await seedDungeon(page, { map: makeMap('t-junction') });
    for (const lightTurns of [0, 30]) {
      await page.evaluate(async (turns) => {
        const { state } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        state.lightTurns = turns;
        state.lightPower = turns > 0 ? 'lomilwa' : null;
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, lightTurns);
      await expect(page.locator('#dungeon-minimap-overlay')).toHaveAttribute('data-minimap-visible', 'true');
      // Explore defaults to the compact card (#1765); check it and the full size.
      for (const size of ['compact', 'full']) {
        if (await page.locator('#game-container').getAttribute('data-minimap-size') !== size) {
          await page.locator('#btn-minimap-toggle').click();
        }
        await expect(page.locator('#game-container')).toHaveAttribute('data-minimap-size', size);
        await page.waitForFunction(() => document.getAnimations().every(animation => !(animation instanceof CSSTransition)));
        const boxes = await page.evaluate(() => {
          const box = (selector) => {
            const element = document.querySelector(selector);
            if (!element || getComputedStyle(element).display === 'none') return null;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 ? { selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
          };
          return {
            minimap: box('#dungeon-minimap-overlay'),
            others: ['#location-label', '#btn-mute', '#goal-banner', '.hud-dir', '#log-panel', '#controls-panel', '#character-panel']
              .map(box).filter(Boolean),
            width: window.innerWidth,
          };
        });
        expect(boxes.minimap).not.toBeNull();
        expect(boxes.minimap.right - boxes.minimap.left).toBeGreaterThanOrEqual(size === 'full' ? 120 : 80);
        expect(boxes.minimap.right).toBeLessThanOrEqual(boxes.width);
        const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        for (const other of boxes.others) {
          expect(overlaps(boxes.minimap, other), `${size} minimap overlaps ${other.selector} at ${viewport.width}px (light ${lightTurns})`).toBe(false);
        }
        const log = boxes.others.find(({ selector }) => selector === '#log-panel');
        for (const other of boxes.others.filter(({ selector }) => ['.hud-dir', '#goal-banner', '#controls-panel'].includes(selector))) {
          expect(overlaps(log, other), `log strip overlaps ${other.selector} at ${viewport.width}px`).toBe(false);
        }
      }
    }
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`issue-1746-minimap-${viewport.width}.png`) });
    await testInfo.attach(`issue-1746-minimap-${viewport.width}`, { body: screenshot, contentType: 'image/png' });
  }
});

test('Portal decision keeps world context, neutral choices, and safe targets at 390x844 @smoke', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await seedPortal(page);
  await page.locator('.milestone-portal-choice-card').first().scrollIntoViewIfNeeded();
  const state = await page.evaluate(() => {
    const choices = [...document.querySelectorAll('.milestone-portal-choice-card')];
    const buttons = choices.map(card => card.querySelector('button').getBoundingClientRect().toJSON());
    return {
      classes: document.querySelector('#game-container').className,
      canvas: document.querySelector('#dungeon-canvas').getBoundingClientRect().toJSON(),
      viewport: document.querySelector('#viewport-panel').getBoundingClientRect().toJSON(),
      labels: choices.map(card => card.querySelector('.milestone-portal-choice-label').textContent),
      buttons,
      styles: choices.map(card => {
        const style = getComputedStyle(card);
        return { border: style.borderColor, background: style.backgroundColor, boxShadow: style.boxShadow };
      }),
    };
  });
  expect(state.classes).toContain('dungeon-first-mode');
  expect(state.canvas.height).toBeGreaterThanOrEqual(843);
  expect(state.viewport.height).toBeGreaterThanOrEqual(843);
  expect(state.labels).toEqual(['ここで帰還', 'さらに深く進む']);
  expect(state.styles[0]).toEqual(state.styles[1]);
  for (const button of state.buttons) {
    expect(button.width).toBeGreaterThanOrEqual(44);
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect(button.top).toBeGreaterThanOrEqual(0);
    expect(button.bottom).toBeLessThanOrEqual(VIEWPORT.height + 1);
  }
  const screenshot = await page.screenshot({ path: testInfo.outputPath('issue-1349-portal-390.png'), fullPage: true });
  await testInfo.attach('issue-1349-portal-390', { body: screenshot, contentType: 'image/png' });
});

test('Dungeon First evidence captures Explore Combat Loot and Portal at 390x844 @smoke', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  const captures = [];
  await seedDungeon(page, { gameState: 'explore' });
  captures.push(['explore', testInfo.outputPath('issue-1349-after-explore-390.png'), await page.screenshot({ path: testInfo.outputPath('issue-1349-after-explore-390.png'), fullPage: true })]);
  await seedDungeon(page, { gameState: 'combat' });
  captures.push(['combat', testInfo.outputPath('issue-1349-after-combat-390.png'), await page.screenshot({ path: testInfo.outputPath('issue-1349-after-combat-390.png'), fullPage: true })]);
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { openChestMenu } = await import('/src/chest.js');
    state.chestState = { x: state.x, y: state.y, trap: 'none', identifiedTrap: 'none', inspected: true, inspectChance: 1, item: 'HEAL_POTION', lootHint: { label: '古い魔力', aura: 'medium' } };
    openChestMenu();
  });
  captures.push(['loot', testInfo.outputPath('issue-1349-after-loot-390.png'), await page.screenshot({ path: testInfo.outputPath('issue-1349-after-loot-390.png'), fullPage: true })]);
  await seedPortal(page);
  await page.locator('.milestone-portal-choice-card').first().scrollIntoViewIfNeeded();
  captures.push(['portal', testInfo.outputPath('issue-1349-after-portal-390.png'), await page.screenshot({ path: testInfo.outputPath('issue-1349-after-portal-390.png'), fullPage: true })]);
  for (const [name, path] of captures) {
    await testInfo.attach(`issue-1349-after-${name}-390`, { path, contentType: 'image/png' });
  }
});

for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }]) {
  test(`Dungeon First keeps safe-area world and controls reachable at ${viewport.width}x${viewport.height} @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedDungeon(page);
    const result = await page.evaluate(() => {
      const container = document.querySelector('#game-container');
      const canvas = document.querySelector('#dungeon-canvas').getBoundingClientRect();
      const character = document.querySelector('#character-panel').getBoundingClientRect();
    const buttons = [...document.querySelectorAll('#controls-panel button')].filter(button => getComputedStyle(button).display !== 'none').map(button => button.getBoundingClientRect().toJSON()).filter(button => button.width > 0 && button.height > 0);
      return {
        canvas, character,
        safeTop: getComputedStyle(container, '::before').backgroundColor,
        safeBottom: getComputedStyle(container, '::after').backgroundColor,
        buttons,
      };
    });
    expect(result.canvas.top).toBeLessThanOrEqual(1);
    expect(result.canvas.height).toBeGreaterThanOrEqual(viewport.height - 1);
    expect(result.character.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(result.safeTop).toBe('rgba(0, 0, 0, 0)');
    expect(result.safeBottom).toBe('rgba(0, 0, 0, 0)');
    for (const button of result.buttons) {
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.bottom).toBeLessThanOrEqual(viewport.height + 1);
    }
  });
}
