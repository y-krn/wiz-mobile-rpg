import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const MONSTERS = Object.freeze({
  small: { name: '検証用小型種', level: 1, hp: 20, maxHp: 20, color: '#c9a86a', spriteType: 'biter' },
  humanoid: { name: '錆びた盾兵', level: 2, hp: 42, maxHp: 42, color: '#b6c8be', spriteType: 'kobold' },
  brute: { name: '墓守の巨躯', level: 5, hp: 130, maxHp: 130, color: '#b86f66', spriteType: 'zombie' },
  caster: { name: '黒曜の魔導士', level: 5, hp: 116, maxHp: 116, color: '#b78ed1', spriteType: 'mage', spell: 'LAHALITO' },
  boss: { name: 'デーモンガード', level: 6, hp: 240, maxHp: 240, color: '#d05b62', spriteType: 'dragon', isBoss: true },
});

async function openPixi(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto('/?renderer=pixi');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
}

async function setCombat(page, monsters, targetSelection = false) {
  await page.evaluate(async ({ monsters: nextMonsters, targetSelection: nextTargetSelection }) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const map = makeMapInPage();
    state.party = [createStartingKitCharacter('vanguard')];
    state.map = map;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.floor = 1; state.x = 4; state.y = 4; state.dir = 0;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = nextTargetSelection ? 'submenu' : 'combat';
    state.transitioning = false;
    state.combatState = { phase: 'choose_actions', monsters: nextMonsters, isBoss: nextMonsters.some(monster => monster.isBoss) };
    Object.assign(menuContext, {
      type: nextTargetSelection ? 'combat_target' : '',
      targetType: nextTargetSelection ? 'enemy' : '',
      prevGameState: nextTargetSelection ? 'combat' : null,
    });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
    document.querySelector('#dungeon-minimap-overlay').style.display = 'block';

    function makeMapInPage() {
      return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
        walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
      })));
    }
  }, { monsters, targetSelection });
}

async function layerEvidence(page) {
  return page.evaluate(async () => {
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput();
    const actors = dungeonRenderer.scene.layers.actors;
    return {
      layout: getCombatMonsterLayout(input.combatMonsters).map(({ monsterIndex, hitRegion }) => ({ monsterIndex, hitRegion })),
      billboards: actors.children.filter(child => child.label?.startsWith('enemy-')).map(child => ({ label: child.label, children: child.children.map(item => item.label) })),
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      fallbackCount: dungeonRenderer.resourceStats.enemyFallbackCount,
      sceneChildren: dungeonRenderer.scene.children.length,
    };
  });
}

test('Pixi combat uses production cutouts for single, pair, trio, boss, targeting, and feedback @smoke @visual @e2e', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=canvas');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'canvas');
  await setCombat(page, [MONSTERS.small]);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-before-canvas-primitive.png') });

  await openPixi(page, { width: 390, height: 844 });

  const assetEvidence = await page.evaluate(async () => {
    const { ENEMY_ARCHETYPES, ENEMY_UNIQUE_ASSETS } = await import('/src/enemy_presentation.js');
    const manifest = {
      ...Object.fromEntries(Object.entries(ENEMY_ARCHETYPES).map(([key, metadata]) => [key, metadata.asset])),
      ...ENEMY_UNIQUE_ASSETS
    };
    const assets = await Promise.all(Object.entries(manifest).map(async ([assetKey, asset]) => {
      const response = await fetch(asset);
      const blob = await response.blob();
      const image = await createImageBitmap(blob);
      return { assetKey, bytes: blob.size, width: image.width, height: image.height };
    }));
    const bytes = assets.reduce((sum, asset) => sum + Number(asset.bytes || 0), 0);
    const largest = assets.reduce((current, asset) => Math.max(current, asset.width * asset.height), 0);
    const { dungeonRenderer } = await import('/src/renderer.js');
    return { assets, bytes, largest, initializationCostMs: dungeonRenderer.initializationCostMs };
  });
  console.log(`[issue-1261-assets] ${JSON.stringify(assetEvidence)}`);
  expect(assetEvidence.assets).toHaveLength(16);
  expect(assetEvidence.bytes).toBeLessThan(1000000);

  await setCombat(page, [MONSTERS.small]);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-single.png') });
  await setCombat(page, [MONSTERS.humanoid, MONSTERS.caster]);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-pair.png') });
  await setCombat(page, [MONSTERS.small, MONSTERS.humanoid, MONSTERS.caster]);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-trio.png') });
  await setCombat(page, [MONSTERS.boss]);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-boss.png') });
  await setCombat(page, [MONSTERS.small, MONSTERS.humanoid, MONSTERS.caster], true);
  const selectedFrame = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-selected-minimap.png') });
  await testInfo.attach('enemy-390-selected-minimap', { body: selectedFrame, contentType: 'image/png' });
  await page.locator('#viewport-panel').screenshot({ path: testInfo.outputPath('enemy-390-minimap-panel.png') });

  const evidence = await layerEvidence(page);
  expect(evidence.billboards).toHaveLength(3);
  expect(evidence.billboards.every(billboard => billboard.children.includes('enemy-cutout'))).toBe(true);
  expect(evidence.textureCount).toBe(16);
  expect(evidence.fallbackCount).toBe(0);
  expect(evidence.sceneChildren).toBe(8);
  expect(evidence.layout.map(entry => entry.monsterIndex)).toEqual([0, 1, 2]);

  const targetEvidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput();
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const layout = (await import('/src/renderer.js')).getCombatMonsterLayout(input.combatMonsters);
    const points = layout.map(({ hitRegion }) => ({
      x: rect.left + (hitRegion.centerX / 400) * rect.width,
      y: rect.top + (hitRegion.centerY / 260) * rect.height,
    }));
    return points.map(point => dungeonRenderer.getCombatTargetAtClientPoint(point.x, point.y, input));
  });
  expect(targetEvidence).toEqual([0, 1, 2]);

  await setCombat(page, [MONSTERS.small, MONSTERS.humanoid, MONSTERS.caster]);
  await page.locator('#btn-combat-fight').click();
  await expect(page.locator('#combat-overlay .combat-target-selection-message')).toBeVisible();
  const targetTap = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput();
    const rect = document.querySelector('#dungeon-canvas').getBoundingClientRect();
    const { getCombatMonsterLayout } = await import('/src/renderer.js');
    const layout = getCombatMonsterLayout(input.combatMonsters)[2];
    return {
      x: (layout.hitRegion.centerX / 400) * rect.width,
      y: (layout.hitRegion.centerY / 260) * rect.height,
    };
  });
  await page.locator('#dungeon-canvas').click({ position: targetTap });
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(async () => (await import('/src/combat.js')).combatSelection.actions[0]?.targetIdx)).toBe(2);

  const feedback = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.damageTexts = [];
    dungeonRenderer.triggerHitFeedback();
    dungeonRenderer.addDamageText('24');
    dungeonRenderer.triggerFlash();
    dungeonRenderer.update(16);
    dungeonRenderer.draw();
    return {
      damageTexts: dungeonRenderer.damageTexts.length,
      combatFxChildren: dungeonRenderer.scene.layers['combat-fx'].children.length,
      fullFrameOverlay: dungeonRenderer.scene.layers.overlays.children.some(child => child.width === 400 && child.height === 260),
    };
  });
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-hit-damage.png') });
  expect(feedback.damageTexts).toBe(1);
  expect(feedback.combatFxChildren).toBeGreaterThan(3);
  expect(feedback.fullFrameOverlay).toBe(false);
});

test('named B1F enemies keep distinct production art identities @smoke @visual @e2e', async ({ page }, testInfo) => {
  await openPixi(page, { width: 390, height: 844 });
  await setCombat(page, [
    { name: 'フラッシュバット', level: 2, hp: 24, maxHp: 24, color: '#e5ff00', spriteType: 'bat' },
    { name: 'マッドスライム', level: 1, hp: 48, maxHp: 48, color: '#ff9500', spriteType: 'biter' },
    { name: 'ゴブリンの呪術師', level: 1, hp: 20, maxHp: 20, color: '#00ff66', spriteType: 'kobold', spell: 'HALITO' },
  ], true);
  const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-named-b1f-trio.png') });
  await testInfo.attach('enemy-390-named-b1f-trio', { body: screenshot, contentType: 'image/png' });
  for (const [filename, monster] of [
    ['enemy-390-named-flash-bat.png', { name: 'フラッシュバット', level: 2, hp: 24, maxHp: 24, color: '#e5ff00', spriteType: 'bat' }],
    ['enemy-390-named-mud-slime.png', { name: 'マッドスライム', level: 1, hp: 48, maxHp: 48, color: '#ff9500', spriteType: 'biter' }],
    ['enemy-390-named-rusted-shield.png', { name: '錆びた盾兵', level: 1, hp: 28, maxHp: 28, color: '#8e8e93', spriteType: 'skeleton' }],
  ]) {
    await setCombat(page, [monster], true);
    await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(filename) });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await setCombat(page, [
    { name: 'フラッシュバット', level: 2, hp: 24, maxHp: 24, color: '#e5ff00', spriteType: 'bat' },
    { name: '錆びた盾兵', level: 1, hp: 28, maxHp: 28, color: '#8e8e93', spriteType: 'skeleton' },
  ], true);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-320-named-bat-shield-pair.png') });
  await setCombat(page, [
    { name: 'フラッシュバット', level: 2, hp: 24, maxHp: 24, color: '#e5ff00', spriteType: 'bat' },
    { name: 'マッドスライム', level: 1, hp: 48, maxHp: 48, color: '#ff9500', spriteType: 'biter' },
    { name: 'ゴブリンの呪術師', level: 1, hp: 20, maxHp: 20, color: '#00ff66', spriteType: 'kobold', spell: 'HALITO' },
  ], true);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-320-named-b1f-trio.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await setCombat(page, [
    { name: '分裂スライムの分裂体1', level: 1, hp: 10, maxHp: 10, color: '#34c759', spriteType: 'biter' },
    { name: '分裂スライムの分裂体2', level: 1, hp: 10, maxHp: 10, color: '#34c759', spriteType: 'biter' },
  ], true);
  await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-390-split-slime-children.png') });
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getEnemyPresentation } = await import('/src/enemy_presentation.js');
    return {
      assetKeys: dungeonRenderer.getRenderInput().combatMonsters.map(monster => getEnemyPresentation(monster).assetKey),
      textureKeys: [...dungeonRenderer.enemyTextures.keys()],
    };
  });
  expect(evidence.assetKeys).toEqual(['enemy:分裂スライム', 'enemy:分裂スライム']);
  expect(evidence.assetKeys.every(assetKey => evidence.textureKeys.includes(assetKey))).toBe(true);
});

for (const viewport of VIEWPORTS) {
  test(`enemy cutouts remain bounded and targetable at ${viewport.width}px @smoke @visual`, async ({ page }, testInfo) => {
    await openPixi(page, viewport);
    await setCombat(page, [MONSTERS.small, MONSTERS.brute, MONSTERS.boss], true);
    const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`enemy-${viewport.width}-trio.png`) });
    await testInfo.attach(`enemy-${viewport.width}-trio`, { body: screenshot, contentType: 'image/png' });
    await page.locator('#viewport-panel').screenshot({ path: testInfo.outputPath(`enemy-${viewport.width}-minimap.png`) });
    const evidence = await layerEvidence(page);
    if (viewport.width === 320) {
      await setCombat(page, [MONSTERS.small], true);
      await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-320-single.png') });
      await setCombat(page, [MONSTERS.humanoid, MONSTERS.caster], true);
      await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-320-pair.png') });
      await setCombat(page, [MONSTERS.boss], true);
      await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('enemy-320-boss.png') });
    }
    expect(evidence.billboards).toHaveLength(3);
    expect(evidence.layout.map(entry => entry.monsterIndex)).toEqual([0, 1, 2]);
    expect(evidence.sceneChildren).toBe(8);
  });
}

test('Pixi enemy asset failure falls back without breaking flow or leaking resources @e2e @smoke', async ({ page }) => {
  await openPixi(page, { width: 390, height: 844 });
  await setCombat(page, [MONSTERS.small]);
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.enemyTextures.delete('small');
    dungeonRenderer.draw();
    const labels = dungeonRenderer.scene.layers.actors.children
      .flatMap(child => child.children?.map(item => item.label) || []);
    const before = dungeonRenderer.resourceStats.enemyTextureCount;
    for (let index = 0; index < 10; index += 1) dungeonRenderer.draw();
    return { labels, before, after: dungeonRenderer.resourceStats.enemyTextureCount, sceneChildren: dungeonRenderer.scene.children.length };
  });
  expect(evidence.labels).toContain('enemy-fallback-silhouette');
  expect(evidence.before).toBe(16);
  expect(evidence.after).toBe(16);
  expect(evidence.sceneChildren).toBe(8);
});

test('Pixi enemy combat motion respects reduced motion and lifecycle stays bounded @e2e @smoke', async ({ page }) => {
  await openPixi(page, { width: 390, height: 844 });
  await setCombat(page, [MONSTERS.humanoid, MONSTERS.caster]);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.triggerCombatEntry();
    dungeonRenderer.triggerHitFeedback();
    dungeonRenderer.triggerShake();
    dungeonRenderer.draw();
    const initial = {
      entry: dungeonRenderer.combatEntryTime,
      hit: dungeonRenderer.hitTime,
      shake: dungeonRenderer.shakeTime,
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      sceneChildren: dungeonRenderer.scene.children.length,
    };
    for (let index = 0; index < 10; index += 1) dungeonRenderer.draw();
    return { initial, final: { textureCount: dungeonRenderer.resourceStats.enemyTextureCount, sceneChildren: dungeonRenderer.scene.children.length } };
  });
  expect(evidence.initial.entry).toBe(0);
  expect(evidence.initial.hit).toBe(0);
  expect(evidence.initial.shake).toBe(0);
  expect(evidence.final.textureCount).toBe(evidence.initial.textureCount);
  expect(evidence.final.sceneChildren).toBe(8);
});

test('Pixi enemy combat enter/exit, target switching, and resize stay stable across repetition @e2e @smoke', async ({ page }) => {
  await openPixi(page, { width: 390, height: 844 });
  const evidence = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const before = {
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      sceneChildren: dungeonRenderer.scene.children.length,
    };
    return before;
  });
  for (let index = 0; index < 10; index += 1) {
    await setCombat(page, index % 2 ? [MONSTERS.small, MONSTERS.caster] : [MONSTERS.humanoid, MONSTERS.boss]);
    await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      dungeonRenderer.triggerCombatEntry();
      dungeonRenderer.update(40);
      dungeonRenderer.draw();
    });
    await page.setViewportSize(VIEWPORTS[index % VIEWPORTS.length]);
    await setCombat(page, [MONSTERS.small]);
  }
  const after = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    return {
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      sceneChildren: dungeonRenderer.scene.children.length,
      listenerCount: dungeonRenderer.resourceStats.listenerCount,
      fallbackCount: dungeonRenderer.resourceStats.enemyFallbackCount,
    };
  });
  expect(after).toEqual({ ...evidence, listenerCount: 0, fallbackCount: 0 });
});
