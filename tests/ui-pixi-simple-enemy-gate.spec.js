import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };

const SUBJECTS = Object.freeze([
  {
    id: 'flash-bat',
    name: 'フラッシュバット',
    spriteType: 'bat',
    color: '#58d6e8',
  },
  {
    id: 'mud-slime',
    name: 'マッドスライム',
    spriteType: 'biter',
    color: '#8a7658',
  },
  {
    id: 'goblin-caster',
    name: 'ゴブリンの呪術師',
    spriteType: 'mage',
    color: '#75c9c2',
  },
  {
    id: 'rusted-shield',
    name: '錆びた盾兵',
    spriteType: 'skeleton',
    color: '#9a6b54',
  },
].map((monster) => Object.freeze({ level: 3, hp: 80, maxHp: 80, ...monster })));

async function openPixi(page, mode = '') {
  const query = mode ? `&enemyPresentation=${mode}` : '';
  await page.setViewportSize(VIEWPORT);
  await page.goto(`/?renderer=pixi${query}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
}

async function setCombat(page, monsters) {
  await page.evaluate(async (nextMonsters) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const map = makeMapInPage();
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
    state.combatState = {
      phase: 'choose_actions',
      monsters: nextMonsters,
      isBoss: false,
    };
    Object.assign(menuContext, { type: '', targetType: '', prevGameState: null });
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();

    function makeMapInPage() {
      return Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
        walls: [true, true, true, true],
        blockEnter: [false, false, false, false],
        type: 'empty',
      })));
    }
  }, monsters);
}

async function capture(page, testInfo, filename) {
  const buffer = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(filename) });
  await testInfo.attach(filename, { body: buffer, contentType: 'image/png' });
  return buffer;
}

async function readPrototypeEvidence(page) {
  return page.evaluate(async () => {
    const { dungeonRenderer, getCombatMonsterLayout } = await import('/src/renderer.js');
    return {
      mode: dungeonRenderer.enemyPresentationMode,
      textureCount: dungeonRenderer.resourceStats.enemyTextureCount,
      layoutIndices: getCombatMonsterLayout(dungeonRenderer.getRenderInput().combatMonsters).map(({ monsterIndex }) => monsterIndex),
      enemyLabels: dungeonRenderer.scene.layers.actors.children
        .filter((child) => child.label?.startsWith('enemy-'))
        .map((child) => ({
          label: child.label,
          children: child.children.map((item) => ({ label: item.label, bounds: item.getBounds?.() })),
          bounds: child.getBounds?.(),
        })),
      sceneChildren: dungeonRenderer.scene.children.length,
    };
  });
}

test('Simple Enemy Presentation Gate produces actual-pixel A/B/C evidence for four prototypes @e2e @visual @smoke', async ({ page }, testInfo) => {
  for (const subject of SUBJECTS) {
    await openPixi(page, 'primitive');
    await setCombat(page, [subject]);
    await capture(page, testInfo, `${subject.id}-original.png`);
    const originalEvidence = await readPrototypeEvidence(page);
    expect(originalEvidence.mode).toBe('primitive');
    expect(originalEvidence.textureCount).toBe(0);
    expect(originalEvidence.enemyLabels[0].children.map((item) => item.label)).toContain('enemy-primitive');

    await openPixi(page);
    await setCombat(page, [subject]);
    await capture(page, testInfo, `${subject.id}-illustrated.png`);
    const illustratedEvidence = await readPrototypeEvidence(page);
    expect(illustratedEvidence.mode).toBe('production');
    expect(illustratedEvidence.textureCount).toBe(16);
    expect(illustratedEvidence.enemyLabels[0].children.map((item) => item.label)).toContain('enemy-cutout');

    await openPixi(page, 'simple-rich');
    await setCombat(page, [subject]);
    await capture(page, testInfo, `${subject.id}-simple-rich.png`);
    const simpleRichEvidence = await readPrototypeEvidence(page);
    expect(simpleRichEvidence.mode).toBe('simple-rich');
    expect(simpleRichEvidence.textureCount).toBe(0);
    expect(simpleRichEvidence.enemyLabels[0].children.map((item) => item.label)).toContain('enemy-simple-rich');
    expect(simpleRichEvidence.layoutIndices).toEqual([0]);
    expect(simpleRichEvidence.sceneChildren).toBe(8);
  }

  await openPixi(page, 'simple-rich');
  await setCombat(page, SUBJECTS);
  await capture(page, testInfo, 'simple-enemy-gate-combined.png');
  const combinedEvidence = await readPrototypeEvidence(page);
  expect(combinedEvidence.mode).toBe('simple-rich');
  expect(combinedEvidence.textureCount).toBe(0);
  expect(combinedEvidence.enemyLabels).toHaveLength(4);
  expect(combinedEvidence.layoutIndices).toEqual([0, 1, 2, 3]);
  expect(combinedEvidence.sceneChildren).toBe(8);
});
