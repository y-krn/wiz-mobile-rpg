import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const NAMED = Object.freeze([
  ['フラッシュバット', 'bat'], ['火薬コウモリ', 'bat'], ['かみつき蟲', 'biter'],
  ['マッドスライム', 'biter'], ['分裂スライム', 'biter'], ['群れネズミ', 'biter'],
  ['まどろみ胞子', 'spirit'], ['泥の呪い子', 'zombie'], ['コボルトの斥候', 'kobold'],
  ['ゴブリンの呪術師', 'kobold'], ['錆びた盾兵', 'skeleton'],
].map(([name, spriteType], index) => Object.freeze({
  name, spriteType, level: 1 + (index % 3), hp: 20 + index * 3, maxHp: 20 + index * 3,
  color: ['#58d6e8', '#d17b4d', '#5aa7a2', '#8a7658'][index % 4],
  ...(name === 'ゴブリンの呪術師' ? { spell: 'HALITO' } : {}),
})));

const FALLBACKS = Object.freeze({
  small: { name: '不明な小型種', spriteType: 'biter' },
  humanoid: { name: '不明な人型', spriteType: 'orc' },
  brute: { name: '巨躯の番人', spriteType: 'zombie' },
  caster: { name: '不明な術者', spriteType: 'mage', spell: 'HALITO' },
  boss: { name: 'デーモンガード', spriteType: 'dragon', isBoss: true },
});

function withVitals(monster) {
  return { level: 3, hp: 80, maxHp: 80, color: '#75c9c2', ...monster };
}

async function openPixi(page, viewport = { width: 390, height: 844 }, query = '') {
  await page.setViewportSize(viewport);
  await page.goto(`/?renderer=pixi${query}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
}

async function setCombat(page, monsters, targetSelection = false) {
  await page.evaluate(async ({ monsters: nextMonsters, targetSelection: nextTargetSelection }) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
    })));
    state.party = [createStartingKitCharacter('vanguard')];
    state.map = map; state.maps[0] = map; state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.floor = 1; state.x = 4; state.y = 4; state.dir = 0;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = nextTargetSelection ? 'submenu' : 'combat';
    state.transitioning = false;
    state.combatState = { phase: 'choose_actions', monsters: nextMonsters, isBoss: nextMonsters.some(monster => monster.isBoss) };
    Object.assign(menuContext, { type: nextTargetSelection ? 'combat_target' : '', targetType: nextTargetSelection ? 'enemy' : '', prevGameState: nextTargetSelection ? 'combat' : null });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
  }, { monsters, targetSelection });
}

async function capture(page, testInfo, filename) {
  const frame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(filename) });
  await testInfo.attach(filename, { body: frame, contentType: 'image/png' });
  return frame;
}

async function captureFrameSheet(page, entries, testInfo, filename, columns = 2) {
  const sheet = await page.context().newPage();
  await sheet.setViewportSize({ width: columns * 390 + (columns + 1) * 10, height: 600 });
  const images = entries.map(({ name, frame }) => `<figure><figcaption>${name}</figcaption><img alt="${name}" src="data:image/png;base64,${frame.toString('base64')}"></figure>`).join('');
  await sheet.setContent(`<style>body{margin:0;background:#081015;color:#9bdde5;font:16px sans-serif}.grid{display:grid;grid-template-columns:repeat(${columns},390px);gap:10px;padding:10px}figure{margin:0;border:1px solid #1c6d77}figcaption{padding:6px;background:#0d2028}img{display:block;width:390px}</style><div class="grid">${images}</div>`);
  const image = await sheet.screenshot({ path: testInfo.outputPath(filename), fullPage: true });
  await testInfo.attach(filename, { body: image, contentType: 'image/png' });
  await sheet.close();
  return image;
}

async function evidence(page) {
  return page.evaluate(async () => {
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput();
    return {
      mode: dungeonRenderer.enemyPresentationMode,
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      failureCount: dungeonRenderer.resourceStats.enemyAssetFailureCount,
      fallbackCount: dungeonRenderer.resourceStats.enemyFallbackCount,
      sceneChildren: dungeonRenderer.scene.children.length,
      billboards: dungeonRenderer.scene.layers.actors.children.filter(child => child.label?.startsWith('enemy-')).map(child => ({
        label: child.label, children: child.children.map(item => item.label),
      })),
      layoutIndices: getCombatMonsterLayout(input.combatMonsters).map(({ monsterIndex }) => monsterIndex),
    };
  });
}

test('procedural production registry renders all named recipes without enemy textures @smoke @visual @e2e', async ({ page }, testInfo) => {
  await openPixi(page);
  const frames = [];
  for (const monster of NAMED) {
    await setCombat(page, [monster]);
    frames.push({ name: monster.name, frame: await capture(page, testInfo, `enemy-390-${monster.name}.png`) });
  }
  await captureFrameSheet(page, frames, testInfo, 'enemy-simple-production-390-contact-sheet-v2.png');
  await captureFrameSheet(page, frames, testInfo, 'enemy-simple-production-390-palette-gate.png');
  const frameByName = new Map(frames.map(frame => [frame.name, frame]));
  await captureFrameSheet(page, [frameByName.get('フラッシュバット'), frameByName.get('火薬コウモリ')], testInfo, 'bat-family-palette.png');
  await captureFrameSheet(page, [frameByName.get('マッドスライム'), frameByName.get('分裂スライム')], testInfo, 'slime-family-palette.png');
  await captureFrameSheet(page, [frameByName.get('泥の呪い子'), frameByName.get('コボルトの斥候'), frameByName.get('ゴブリンの呪術師'), frameByName.get('錆びた盾兵')], testInfo, 'humanoid-family-palette.png');
  await captureFrameSheet(page, [frameByName.get('かみつき蟲'), frameByName.get('群れネズミ'), frameByName.get('まどろみ胞子')], testInfo, 'small-threat-family-palette.png');

  await setCombat(page, [NAMED[0], NAMED[4], NAMED[10]], true);
  await capture(page, testInfo, 'enemy-390-production-trio-v2.png');
  await setCombat(page, [NAMED[4], NAMED[5]], true);
  await capture(page, testInfo, 'enemy-390-production-pair-selected-v2.png');
  await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.damageTexts = []; dungeonRenderer.triggerHitFeedback(); dungeonRenderer.addDamageText('24'); dungeonRenderer.triggerFlash(); dungeonRenderer.update(16); dungeonRenderer.draw();
  });
  await capture(page, testInfo, 'enemy-390-production-hit-damage-v2.png');
  await setCombat(page, [withVitals(FALLBACKS.boss)]);
  await capture(page, testInfo, 'enemy-390-production-boss-fallback-v2.png');
  await setCombat(page, [NAMED[2], NAMED[9], NAMED[10]], true);
  await capture(page, testInfo, 'enemy-390-palette-trio.png');

  await page.setViewportSize({ width: 320, height: 568 });
  await setCombat(page, [NAMED[0], NAMED[10]], true);
  await capture(page, testInfo, 'enemy-320-production-bat-shield-pair-v2.png');
  await setCombat(page, [NAMED[3], NAMED[5]], false);
  await capture(page, testInfo, 'enemy-320-production-slime-swarm-v2.png');
  await setCombat(page, [withVitals(FALLBACKS.boss)]);
  await capture(page, testInfo, 'enemy-320-production-boss-fallback-v2.png');
  await setCombat(page, [NAMED[3], NAMED[5], NAMED[6]], true);
  await capture(page, testInfo, 'enemy-320-palette-trio.png');
  await setCombat(page, [NAMED[0]]);

  const current = await evidence(page);
  expect(current.mode).toBe('production');
  expect(current.textureCount).toBe(0);
  expect(current.failureCount).toBe(0);
  expect(current.fallbackCount).toBe(0);
  expect(current.billboards.every(({ children }) => children.includes('enemy-procedural'))).toBe(true);
  expect(current.sceneChildren).toBe(9);
  expect(current.layoutIndices).toEqual([0]);
});

test('procedural registry preserves distinct recipe mappings, target indices, and fallback safety @smoke @e2e', async ({ page }) => {
  await openPixi(page);
  const mapping = await page.evaluate(async () => {
    const { ENEMY_UNIQUE_RECIPES, getEnemyPresentation } = await import('/src/enemy_presentation.js');
    const { getProceduralRecipeKeys } = await import('/src/pixi_enemy_prototypes.js');
    return { named: ENEMY_UNIQUE_RECIPES, keys: getProceduralRecipeKeys(), presentations: Object.fromEntries(Object.keys(ENEMY_UNIQUE_RECIPES).map(name => [name, getEnemyPresentation({ name })])) };
  });
  expect(Object.keys(mapping.named)).toHaveLength(11);
  expect(new Set(Object.values(mapping.named)).size).toBe(11);
  expect(mapping.keys).toEqual(expect.arrayContaining(['small', 'humanoid', 'brute', 'caster', 'boss']));
  expect(Object.values(mapping.presentations).every(({ asset, recipe }) => asset === null && recipe)).toBe(true);

  await setCombat(page, [NAMED[0], NAMED[4], NAMED[10]], true);
  const current = await evidence(page);
  expect(current.layoutIndices).toEqual([0, 1, 2]);
  expect(current.billboards).toHaveLength(3);
  expect(current.sceneChildren).toBe(9);

  for (const fallback of Object.values(FALLBACKS)) {
    await setCombat(page, [withVitals(fallback)]);
    const fallbackEvidence = await evidence(page);
    expect(fallbackEvidence.textureCount).toBe(0);
    expect(fallbackEvidence.fallbackCount).toBe(0);
    expect(fallbackEvidence.billboards[0].children).toContain('enemy-procedural');
  }
});

for (const viewport of VIEWPORTS) {
  test(`procedural enemies remain bounded and targetable at ${viewport.width}px @smoke @visual`, async ({ page }, testInfo) => {
    await openPixi(page, viewport);
    await setCombat(page, [NAMED[0], NAMED[4], NAMED[10]], true);
    await capture(page, testInfo, `enemy-${viewport.width}-production-trio.png`);
    const current = await evidence(page);
    expect(current.textureCount).toBe(0);
    expect(current.billboards).toHaveLength(3);
    expect(current.layoutIndices).toEqual([0, 1, 2]);
    expect(current.sceneChildren).toBe(9);
  });
}

test('procedural enemy feedback and lifecycle remain local and stable with reduced motion @smoke @e2e', async ({ page }) => {
  await openPixi(page);
  await setCombat(page, [NAMED[0], NAMED[9]]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.triggerCombatEntry(); dungeonRenderer.triggerHitFeedback(); dungeonRenderer.triggerShake(); dungeonRenderer.draw();
    const initial = { entry: dungeonRenderer.combatEntryTime, hit: dungeonRenderer.hitTime, shake: dungeonRenderer.shakeTime, textures: dungeonRenderer.resourceStats.enemyTextureCount, children: dungeonRenderer.scene.children.length };
    for (let index = 0; index < 10; index += 1) dungeonRenderer.draw();
    return { initial, final: { textures: dungeonRenderer.resourceStats.enemyTextureCount, children: dungeonRenderer.scene.children.length, listeners: dungeonRenderer.resourceStats.listenerCount } };
  });
  expect(state.initial).toMatchObject({ entry: 0, hit: 0, shake: 0, textures: 0, children: 8 });
  expect(state.final).toEqual({ textures: 0, children: 8, listeners: 0 });
});
