import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };
const SUBJECTS = Object.freeze([
  { id: 'flash-bat', name: 'フラッシュバット', spriteType: 'bat', color: '#58d6e8' },
  { id: 'mud-slime', name: 'マッドスライム', spriteType: 'biter', color: '#8a7658' },
  { id: 'goblin-caster', name: 'ゴブリンの呪術師', spriteType: 'mage', color: '#75c9c2' },
  { id: 'rusted-shield', name: '錆びた盾兵', spriteType: 'skeleton', color: '#9a6b54' },
].map((monster) => Object.freeze({ level: 3, hp: 80, maxHp: 80, ...monster })));

async function openSimpleRich(page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi&enemyPresentation=simple-rich');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
}

async function setCombat(page, monsters) {
  await page.evaluate(async (nextMonsters) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    })));
    state.party = [createStartingKitCharacter('vanguard')];
    state.map = map;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row) => row.map(() => true));
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'combat';
    state.transitioning = false;
    state.combatState = { phase: 'choose_actions', monsters: nextMonsters, isBoss: false };
    Object.assign(menuContext, { type: '', targetType: '', prevGameState: null });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
  }, monsters);
}

async function capture(page, testInfo, filename) {
  const buffer = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(filename) });
  await testInfo.attach(filename, { body: buffer, contentType: 'image/png' });
}

test('Simple Enemy Value Review v3 captures one value-only iteration at gameplay size @e2e @visual @smoke', async ({ page }, testInfo) => {
  for (const subject of SUBJECTS) {
    await openSimpleRich(page);
    await setCombat(page, [subject]);
    await capture(page, testInfo, `${subject.id}-simple-rich-v3.png`);
  }

  await openSimpleRich(page);
  await setCombat(page, SUBJECTS);
  await capture(page, testInfo, 'simple-enemy-gate-combined-v3.png');
  await capture(page, testInfo, 'simple-enemy-value-diagnostic-v3.png');

  const valueDiagnostic = await page.evaluate(async () => {
    const { SIMPLE_ENEMY_VALUE_TOKENS } = await import('/src/pixi_enemy_prototypes.js');
    const luminance = (color) => {
      const red = (color >> 16) & 0xff;
      const green = (color >> 8) & 0xff;
      const blue = color & 0xff;
      return Number((0.2126 * red + 0.7152 * green + 0.0722 * blue).toFixed(2));
    };
    const values = Object.fromEntries(Object.entries(SIMPLE_ENEMY_VALUE_TOKENS)
      .map(([name, color]) => [name, { color: `#${color.toString(16).padStart(6, '0')}`, luminance: luminance(color) }]));
    const { dungeonRenderer } = await import('/src/renderer.js');
    return {
      mode: dungeonRenderer.enemyPresentationMode,
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      values,
    };
  });
  await testInfo.attach('simple-enemy-value-diagnostic-v3.json', {
    body: JSON.stringify(valueDiagnostic, null, 2),
    contentType: 'application/json',
  });
  expect(valueDiagnostic.mode).toBe('simple-rich');
  expect(valueDiagnostic.textureCount).toBe(0);
  expect(valueDiagnostic.values.main.luminance).toBeGreaterThan(valueDiagnostic.values.background.luminance);
  expect(valueDiagnostic.values.secondary.luminance).toBeGreaterThan(valueDiagnostic.values.main.luminance);
});
