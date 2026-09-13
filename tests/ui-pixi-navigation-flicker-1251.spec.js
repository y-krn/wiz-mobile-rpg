import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];
const EVIDENCE_DIR = process.env.PIXI_EVIDENCE_DIR || '';

function persistEvidence(name, buffer) {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(`${EVIDENCE_DIR}/${name}`, buffer);
}

function makeFixture() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
  })));
  for (const [x, y, direction] of [[4, 4, 0], [4, 3, 0], [4, 2, 0]]) {
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = directions[direction];
    map[y][x].walls[direction] = false;
    map[y + dy][x + dx].walls[(direction + 2) % 4] = false;
  }
  return map;
}

async function setExploreState(page) {
  await page.evaluate(async (map) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('scholar')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1; state.x = 4; state.y = 4; state.dir = 0;
    state.map = map; state.maps[0] = map; state.mapRevision = (state.mapRevision || 0) + 1;
    state.visitedMaps[0] = map.map((row) => row.map(() => true));
    state.gameState = 'explore'; state.transitioning = false; state.combatState = null;
    menuContext.type = ''; menuContext.targetType = ''; menuContext.prevGameState = null;
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    window.__issue1251Flicker = { state, menuContext, dungeonRenderer };
    dungeonRenderer.draw();
  }, makeFixture());
}

test('ordinary Pixi navigation replaces structural geometry without flicker @smoke @visual', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await setExploreState(page);

    const evidence = await page.evaluate(() => {
      const { state, menuContext, dungeonRenderer } = window.__issue1251Flicker;
      const canvas = document.querySelector('#dungeon-canvas');
      const frame = () => canvas.toDataURL('image/png');
      const samples = {};
      const actions = {
        forward: () => { state.y = 3; },
        backward: () => { state.y = 5; },
        'turn-left': () => { state.dir = 3; },
        'turn-right': () => { state.dir = 1; },
      };
      for (const [action, applyState] of Object.entries(actions)) {
        state.x = 4; state.y = 4; state.dir = 0; state.mapRevision += 1;
        dungeonRenderer.cancelNavigationTransition();
        dungeonRenderer.draw();
        const beforeFrame = frame();
        const inputBefore = dungeonRenderer.getRenderInput();
        dungeonRenderer.beginNavigationTransition(action, inputBefore);
        applyState();
        state.mapRevision += 1;
        menuContext.type = '';
        dungeonRenderer.update(0);
        dungeonRenderer.draw();
        const firstChangedFrame = frame();
        dungeonRenderer.update(16);
        dungeonRenderer.draw();
        const finalFrame = frame();
        const root = dungeonRenderer.scene;
        const transitionRoot = dungeonRenderer.transitionScene;
        samples[action] = {
          beforeFrame,
          firstChangedFrame,
          finalFrame,
          sceneAlpha: root.alpha,
          sceneX: root.position.x,
          sceneY: root.position.y,
          sceneRotation: root.rotation,
          sceneScaleX: root.scale.x,
          sceneScaleY: root.scale.y,
          structuralWallsAlpha: root.layers['structural-walls'].alpha,
          floorAlpha: root.layers.floor.alpha,
          transitionActive: Boolean(dungeonRenderer.transition),
          transitionVisible: Boolean(transitionRoot?.visible),
          transitionChildren: transitionRoot?.children.length ?? 0,
          stageChildren: dungeonRenderer.app.stage.children.length,
          stageLabels: dungeonRenderer.app.stage.children.map((child) => child.label),
          shakeTime: dungeonRenderer.shakeTime,
          flashTime: dungeonRenderer.flashTime,
          hitTime: dungeonRenderer.hitTime,
          combatEntryTime: dungeonRenderer.combatEntryTime,
        };
      }
      return samples;
    });

    for (const [action, sample] of Object.entries(evidence)) {
      for (const phase of ['before', 'first-changed', 'final']) {
        const dataUrl = {
          before: sample.beforeFrame,
          'first-changed': sample.firstChangedFrame,
          final: sample.finalFrame,
        }[phase];
        const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
        await testInfo.attach(`pixi-${action}-${phase}-${viewport.width}`, { body: buffer, contentType: 'image/png' });
        persistEvidence(`pixi-${action}-${phase}-${viewport.width}.png`, buffer);
      }
      expect(sample.sceneAlpha).toBe(1);
      expect(sample.sceneX).toBe(0);
      expect(sample.sceneY).toBe(0);
      expect(sample.sceneRotation).toBe(0);
      expect(sample.sceneScaleX).toBe(1);
      expect(sample.sceneScaleY).toBe(1);
      expect(sample.structuralWallsAlpha).toBe(1);
      expect(sample.floorAlpha).toBe(1);
      expect(sample.transitionActive).toBe(false);
      expect(sample.transitionVisible).toBe(false);
      expect(sample.transitionChildren).toBe(0);
      expect(sample.stageChildren).toBe(1);
      expect(sample.stageLabels).toEqual(['pixi-current-scene']);
      expect(sample.shakeTime).toBe(0);
      expect(sample.flashTime).toBe(0);
      expect(sample.hitTime).toBe(0);
      expect(sample.combatEntryTime).toBe(0);
      expect(sample.beforeFrame).toBeTruthy();
      expect(sample.firstChangedFrame).toBeTruthy();
      expect(sample.finalFrame).toBeTruthy();
      delete sample.beforeFrame;
      delete sample.firstChangedFrame;
      delete sample.finalFrame;
    }
  }
});
