import { test, expect } from './fixtures/browser-health.js';
import { waitForPixiReady } from './ui-ux-helpers.js';

test.use({ reducedMotion: 'reduce', hasTouch: true });

const MONSTERS = [
  { name: 'ゾンビ', level: 2, hp: 32, maxHp: 32, color: '#8a2be2', spriteType: 'zombie' },
  { name: '墓守の巨躯', level: 5, hp: 95, maxHp: 95, color: '#ff3b30', spriteType: 'zombie' },
  { name: 'ストーンガード', level: 5, hp: 110, maxHp: 110, color: '#708090', spriteType: 'zombie' },
];

test('Pixi three-monster mobile scene keeps distinct bodies and targetable layout @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForPixiReady(page);
  await page.evaluate(async monsters => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer_runtime.js');
    const map = Array.from({ length: 8 }, () => (
      Array.from({ length: 8 }, () => ({ walls: [false, false, false, false], type: 'empty' }))
    ));
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.map = map;
    state.floor = 1;
    state.x = 3;
    state.y = 3;
    state.dir = 0;
    state.gameState = 'combat';
    state.combatState = { phase: 'choose_actions', monsters, playerActions: [], isAuto: false };
    dungeonRenderer.draw();
  }, MONSTERS);

  await page.screenshot({ path: testInfo.outputPath('pixi-monster-render-390.png'), fullPage: true });
  const result = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer_runtime.js');
    const { getCombatMonsterLayout } = await import('/src/rules/renderer_projection.js');
    const input = dungeonRenderer.getRenderInput();
    const labels = dungeonRenderer.scene.layers.actors.children
      .filter(child => child.text)
      .map(child => typeof child.text === 'string' ? child.text : child.text.text);
    return {
      mode: dungeonRenderer.mode,
      labels,
      actorCount: dungeonRenderer.scene.layers.actors.children.length,
      layoutCount: getCombatMonsterLayout(input.combatMonsters, dungeonRenderer.viewport).length,
      enemyPresentationCount: dungeonRenderer.resourceStats.enemyPresentationCount,
      renderCount: dungeonRenderer.renderCount,
    };
  });

  expect(result.mode).toBe('pixi');
  expect(result.labels.filter(label => label === 'ゾンビ' || label === '墓守の巨躯' || label === 'ストーンガード')).toHaveLength(3);
  expect(result.actorCount).toBeGreaterThan(3);
  expect(result.layoutCount).toBe(3);
  expect(result.enemyPresentationCount).toBeGreaterThanOrEqual(3);
  expect(result.renderCount).toBeGreaterThan(0);
});


async function installRoleCombat(page, names, { telegraph = false } = {}) {
  await page.evaluate(async ({ names, telegraph }) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { MONSTERS } = await import('/src/data/monsters.js');
    const { updateUI } = await import('/src/ui.js');
    const { combatSelection } = await import('/src/combat.js');
    const { menuContext } = await import('/src/navigation.js');
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    const map = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ walls: [false, false, false, false], type: 'empty' })));
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('arcana')];
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.map = map;
    state.visitedMap = state.visitedMaps[0];
    Object.assign(state, { floor: 1, x: 3, y: 3, dir: 0, gameState: 'combat', transitioning: false });
    state.combatState = {
      phase: 'choose_actions', roundNumber: 1, isAuto: false,
      monsters: names.map(name => {
        const monster = MONSTERS.find(monster => monster.name === name);
        return { ...monster, maxHp: monster.hp, lahalitoQueued: telegraph };
      }),
    };
    combatSelection.charIdx = 0;
    combatSelection.actions = [];
    updateUI();
  }, { names, telegraph });
  await expect.poll(() => page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer_runtime.js');
    const rect = dungeonRenderer.canvas.parentElement.getBoundingClientRect();
    return dungeonRenderer.viewport.width === Math.round(rect.width) && dungeonRenderer.viewport.height === Math.round(rect.height);
  })).toBe(true);
  await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer_runtime.js');
    dungeonRenderer.draw();
    await document.fonts.ready;
  });
}

async function readRoleScene(page) {
  return page.evaluate(async () => {
    const { dungeonRenderer: renderer } = await import('/src/renderer_runtime.js');
    const { getCombatMonsterLayout } = await import('/src/rules/renderer_projection.js');
    const input = renderer.getRenderInput();
    const layout = getCombatMonsterLayout(input.combatMonsters, renderer.viewport);
    const actors = renderer.scene.layers.actors.children;
    const bounds = child => {
      const rect = child.getBounds().rectangle;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const billboards = actors.filter(child => child.label?.startsWith('enemy-procedural-'));
    const bodies = billboards.map(bounds);
    const bars = actors.filter(child => child.label?.startsWith('combat-enemy-hp-')).map(bounds);
    const labels = actors.filter(child => child.text).map(bounds);
    const badges = renderer.scene.layers['combat-fx'].children.filter(child => child.label?.startsWith('telegraph-')).map(bounds);
    const canvasRect = renderer.canvas.getBoundingClientRect();
    const screenScale = Math.min(canvasRect.width / renderer.viewport.width, canvasRect.height / renderer.viewport.height);
    const occluders = ['#game-header', '#goal-banner', '#combat-controls', '#character-panel', '#combat-prompt']
      .flatMap(selector => {
        const element = document.querySelector(selector);
        if (!element || getComputedStyle(element).display === 'none') return [];
        const rect = element.getBoundingClientRect();
        return rect.width && rect.height ? [{ x: (rect.x - canvasRect.x) / screenScale, y: (rect.y - canvasRect.y) / screenScale,
          width: rect.width / screenScale, height: rect.height / screenScale }] : [];
      });
    return { width: renderer.viewport.width, height: renderer.viewport.height, bodies, bars, labels, badges, occluders,
      layout: layout.map(({ cx, floorY, hpY, slotWidth, hitRegion }) => ({ cx, floorY, hpY, slotWidth, hitRegion })) };
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`Pixi encounter roles have distinct solo silhouettes (${viewport.width}px) @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await waitForPixiReady(page);
    const scenes = [];
    for (const name of ['ゾンビ', 'フラック', 'デーモンガード']) {
      await installRoleCombat(page, [name], { telegraph: true });
      const scene = await readRoleScene(page);
      const body = scene.bodies[0];
      expect(body.x).toBeGreaterThan(0);
      expect(body.x + body.width).toBeLessThan(scene.width);
      expect(body.y).toBeGreaterThan(scene.labels[0].y + scene.labels[0].height + 5);
      expect(body.y + body.height).toBeLessThan(scene.height * 0.72);
      expect(scene.badges[0].y + scene.badges[0].height).toBeLessThan(scene.labels[0].y);
      await page.screenshot({ path: testInfo.outputPath(`solo-${name}-${viewport.width}.png`), fullPage: true });
      scenes.push(scene);
    }
    expect(scenes[1].bodies[0].height).toBeGreaterThan(scenes[0].bodies[0].height * 1.3);
    expect(scenes[2].bodies[0].height).toBeGreaterThan(scenes[1].bodies[0].height * 1.4);
    expect(scenes[2].bodies[0].width).toBeGreaterThan(scenes[2].width * 0.58);
    expect(scenes[2].layout[0].cx).toBe(scenes[2].width / 2);
  });

  test(`Pixi encounter roles keep grouped bodies and warnings separate (${viewport.width}px) @visual`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await waitForPixiReady(page);
    for (const names of [
      ['ゾンビ', 'フラック', 'デーモンガード'],
      ['デーモンガード', 'フラック', 'ゾンビ', 'ストーンガード'],
      ['ゾンビ', 'フラック', 'デーモンガード', 'ゾンビ', 'フラック', 'デーモンガード'],
    ]) {
      await installRoleCombat(page, names, { telegraph: true });
      const scene = await readRoleScene(page);
      expect(scene.bodies).toHaveLength(names.length);
      expect(scene.badges).toHaveLength(names.length);
      expect(scene.bars).toHaveLength(names.length);
      for (let index = 0; index < names.length; index += 1) {
        const body = scene.bodies[index];
        const label = scene.labels[index];
        const badge = scene.badges[index];
        const entry = scene.layout[index];
        expect(body.x).toBeGreaterThanOrEqual(entry.cx - entry.slotWidth / 2);
        expect(body.x + body.width).toBeLessThanOrEqual(entry.cx + entry.slotWidth / 2);
        expect(body.y).toBeGreaterThan(label.y + label.height + 5);
        expect(badge.y).toBeGreaterThan(0);
        expect(badge.y + badge.height).toBeLessThan(label.y);
        expect(label.x).toBeGreaterThanOrEqual(entry.cx - entry.slotWidth / 2);
        expect(label.x + label.width).toBeLessThanOrEqual(entry.cx + entry.slotWidth / 2);
        for (const visible of [body, label, badge, scene.bars[index]]) for (const hud of scene.occluders) {
          expect(visible.x + visible.width <= hud.x || hud.x + hud.width <= visible.x ||
            visible.y + visible.height <= hud.y || hud.y + hud.height <= visible.y).toBe(true);
        }
        for (let other = index + 1; other < names.length; other += 1) {
          const all = [body, label, badge, scene.bars[index]];
          const others = [scene.bodies[other], scene.labels[other], scene.badges[other], scene.bars[other]];
          for (const first of all) for (const second of others) {
            expect(first.x + first.width <= second.x || second.x + second.width <= first.x ||
              first.y + first.height <= second.y || second.y + second.height <= first.y).toBe(true);
          }
        }
      }
      if (names.length === 3) {
        expect(scene.bodies[1].height).toBeGreaterThan(scene.bodies[0].height * 1.3);
        expect(scene.bodies[2].height).toBeGreaterThan(scene.bodies[1].height);
      }
      await page.screenshot({ path: testInfo.outputPath(`group-${names.length}-${viewport.width}.png`), fullPage: true });
    }
  });

  test(`Pixi enlarged demon upper body accepts click and touch (${viewport.width}px) @visual`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await waitForPixiReady(page);
    for (const [index, useTouch] of [[1, false], [2, true]]) {
      await installRoleCombat(page, ['ゾンビ', 'フラック', 'デーモンガード']);
      await page.locator('#btn-combat-fight').press('Enter');
      await expect(page.locator('#combat-overlay .combat-target-a11y')).toHaveCount(3);
      const point = await page.evaluate(async index => {
        const { dungeonRenderer: renderer } = await import('/src/renderer_runtime.js');
        const { getCombatMonsterLayout } = await import('/src/rules/renderer_projection.js');
        const entry = getCombatMonsterLayout(renderer.getRenderInput().combatMonsters, renderer.viewport)[index];
        const body = renderer.scene.layers.actors.children.filter(child => child.label?.startsWith('enemy-procedural-'))[index].getBounds().rectangle;
        const rect = renderer.canvas.getBoundingClientRect();
        const scale = Math.min(rect.width / renderer.viewport.width, rect.height / renderer.viewport.height);
        // A head tap exercises the enlarged silhouette above the old region.
        const x = rect.left + (rect.width - renderer.viewport.width * scale) / 2 + entry.cx * scale;
        const y = rect.top + (rect.height - renderer.viewport.height * scale) / 2 + (body.y + body.height * 0.25) * scale;
        const target = renderer.getCombatTargetAtClientPoint(x, y);
        const fx = renderer.scene.layers['combat-fx'];
        const rings = fx.children.filter(child => child.label === 'combat-target').map(child => child.getBounds().rectangle);
        renderer.hitTarget = index;
        renderer.hitTime = 220;
        renderer.drawHitFeedback(renderer.getRenderInput());
        const hit = fx.children.at(-2).getBounds().rectangle;
        const anchor = renderer.combatAnchors.get(index);
        return { x, y, target, ringCenterY: rings[index].y + rings[index].height / 2,
          expectedRingY: entry.floorY + entry.scale, hitCenterY: hit.y + hit.height / 2,
          expectedHitY: entry.hitRegion.centerY, anchorY: anchor.y, bodyTop: body.y, bodyBottom: body.y + body.height };

      }, index);
      expect(point.target).toBe(index);
      expect(point.ringCenterY).toBeCloseTo(point.expectedRingY, 1);
      expect(point.hitCenterY).toBeCloseTo(point.expectedHitY, 1);
      expect(point.anchorY).toBeGreaterThan(point.bodyTop);
      expect(point.anchorY).toBeLessThan(point.bodyBottom);
      if (useTouch) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await expect.poll(() => page.evaluate(async () => {
        const { combatSelection } = await import('/src/combat.js');
        return combatSelection.actions.map(({ type, actorIdx, targetIdx }) => ({ type, actorIdx, targetIdx }));
      })).toEqual([{ type: 'fight', actorIdx: 0, targetIdx: index }]);
    }
  });
}
