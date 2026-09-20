import { test, expect } from './fixtures/browser-health.js';

const MONSTERS = [
  { name: 'ゾンビ', level: 2, hp: 32, maxHp: 32, color: '#8a2be2', spriteType: 'zombie' },
  { name: '墓守の巨躯', level: 5, hp: 95, maxHp: 95, color: '#ff3b30', spriteType: 'zombie' },
  { name: 'ストーンガード', level: 5, hp: 110, maxHp: 110, color: '#708090', spriteType: 'zombie' },
];

test('Pixi three-monster mobile scene keeps distinct bodies and targetable layout @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
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
