import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

test('Three.js Dungeon View keeps the four shell regions and renders at mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

    const layout = await page.evaluate(() => {
      const canvas = document.querySelector('#dungeon-canvas');
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      return {
        viewport: rect('#viewport-panel'),
        canvas: rect('#dungeon-canvas'),
        regions: Array.from(document.querySelectorAll('[data-shell-region]')).map((element) => element.dataset.shellRegion),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
        canvasSize: [canvas.width, canvas.height],
      };
    });

    expect(layout.webgl).toBe(true);
    expect(layout.canvasSize).toEqual([400, 260]);
    expect(layout.regions).toEqual(expect.arrayContaining([
      'minimal-hud', 'dungeon-view', 'current-event-strip', 'action-dock',
    ]));
    expect(layout.canvas.width).toBeGreaterThan(0);
    expect(layout.canvas.height).toBeGreaterThan(0);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.viewport.left).toBeGreaterThanOrEqual(-1);
    expect(layout.viewport.right).toBeLessThanOrEqual(layout.clientWidth + 1);
    await page.screenshot({ path: testInfo.outputPath(`three-renderer-${viewport.width}x${viewport.height}.png`) });
  }
});

test('Three.js Dungeon View directly selects an enemy and retains an accessible fallback @smoke @e2e', async ({ page }) => {
  await page.goto('/?renderer=three');
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');

  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const { openCombatTargetMenu } = await import('/src/combat_ui/target_menu.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.gameState = 'combat';
    state.transitioning = false;
    state.map = [[{ walls: [false, false, false, false], blockEnter: [false, false, false, false], type: 'empty' }]];
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '強敵の検証体', level: 5, hp: 20, maxHp: 20, color: '#d45de6', spriteType: 'golem' },
        { name: '遠方の検証体', level: 1, hp: 12, maxHp: 12, color: '#58d6e8', spriteType: 'wisp' },
      ],
    };
    menuContext.actorIdx = 0;
    window.__threeTarget = null;
    openCombatTargetMenu('enemy', (targetIdx) => {
      window.__threeTarget = targetIdx;
      updateUI();
    });
    updateUI();
  });

  await expect(page.locator('.combat-target-selection-message')).toHaveText('敵をタップして対象を選択');
  await expect(page.locator('.combat-target-a11y-list')).toHaveCount(1);
  await expect(page.locator('.combat-target-a11y')).toHaveCount(2);
  await expect(page.locator('.combat-target-a11y-list')).toHaveCSS('position', 'absolute');

  await page.locator('#dungeon-canvas').click({ position: { x: 200, y: 120 } });
  await expect.poll(() => page.evaluate(() => window.__threeTarget)).toBe(0);
  await expect(page.locator('#combat-overlay')).toBeHidden();
});

test('Canvas and Three.js render the same representative dungeon states for comparison @visual', async ({ page }, testInfo) => {
  const modes = ['canvas', 'three'];
  const measurements = {};

  for (const mode of modes) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(mode === 'three' ? '/?renderer=three' : '/');
    if (mode === 'three') await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');

    await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      const makeCell = () => ({ walls: [false, false, false, false], blockEnter: [false, false, false, false], type: 'empty' });
      state.party = [createStartingKitCharacter('arcana')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 4;
      state.x = 4;
      state.y = 4;
      state.dir = 0;
      state.gameState = 'explore';
      state.transitioning = false;
      state.map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
      state.map[4][5].walls[0] = true;
      state.map[3][4].event = 'midboss';
      state.roamingMonsters = [{ floor: 4, x: 4, y: 2, kind: 'elite', perception: 'visible' }];
      updateUI();
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      renderer.draw();
    });
    await page.screenshot({ path: testInfo.outputPath(`${mode}-explore-danger.png`) });

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      state.gameState = 'combat';
      state.roamingMonsters = [];
      state.combatState = {
        phase: 'choose_actions',
        monsters: [
          { name: '禁書の番人', level: 5, hp: 30, maxHp: 30, color: '#54c8c3', spriteType: 'golem' },
          { name: '影の護衛', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
        ],
      };
      menuContext.type = '';
      menuContext.prevGameState = null;
      updateUI();
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      renderer.draw();
    });
    await page.screenshot({ path: testInfo.outputPath(`${mode}-combat-multiple.png`) });

    measurements[mode] = await page.evaluate(async () => {
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      const frameTimes = [];
      for (let index = 0; index < 31; index += 1) {
        const start = performance.now();
        renderer.draw();
        if (index > 0) frameTimes.push(performance.now() - start);
      }
      const sorted = [...frameTimes].sort((left, right) => left - right);
      return {
        medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
        maxMs: Number(Math.max(...frameTimes).toFixed(3)),
        canvasSize: [document.querySelector('#dungeon-canvas').width, document.querySelector('#dungeon-canvas').height],
      };
    });
  }

  console.log(`[issue-1146] renderer comparison ${JSON.stringify(measurements)}`);
  expect(measurements.canvas.canvasSize).toEqual([400, 260]);
  expect(measurements.three.canvasSize).toEqual([400, 260]);
});
