import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from './fixtures/browser-health.js';

const EVIDENCE_DIR = process.env.PIXI_EVIDENCE_DIR || '';
const VIEWPORT = { width: 390, height: 844 };

function persistEvidence(name, buffer) {
  if (!EVIDENCE_DIR) return;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(`${EVIDENCE_DIR}/${name}`, buffer);
}

function makeFixture() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
  })));
  for (const [x, y, direction] of [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]]) {
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
    window.__issue1238 = { state, menuContext, dungeonRenderer };
    dungeonRenderer.draw();
  }, makeFixture());
}

async function capture(page, testInfo, name) {
  const buffer = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await testInfo.attach(name, { body: buffer, contentType: 'image/png' });
  persistEvidence(`${name}.png`, buffer);
}

async function captureDataUrl(testInfo, name, dataUrl) {
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await testInfo.attach(name, { body: buffer, contentType: 'image/png' });
  persistEvidence(`${name}.png`, buffer);
}

test('PixiJS navigation motion stays low-amplitude and screen-stable @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await setExploreState(page);

  const results = {};
  for (const action of ['forward', 'turn-left', 'turn-right']) {
    await capture(page, testInfo, `pixi-${action}-before`);
    const mid = await page.evaluate(({ action }) => {
      const { state, menuContext, dungeonRenderer } = window.__issue1238;
      dungeonRenderer.update(125);
      dungeonRenderer.draw();
      const inputBefore = dungeonRenderer.getRenderInput();
      dungeonRenderer.beginNavigationTransition(action, inputBefore);
      if (action === 'forward') state.y = 3;
      if (action === 'turn-left') state.dir = 3;
      if (action === 'turn-right') state.dir = 1;
      state.mapRevision += 1;
      menuContext.type = '';
      dungeonRenderer.update(0);
      dungeonRenderer.draw();
      dungeonRenderer.update(62);
      dungeonRenderer.draw();
      const rootSnapshot = (root) => ({
        x: root.position.x,
        y: root.position.y,
        rotation: root.rotation,
        scaleX: root.scale.x,
        scaleY: root.scale.y,
        alpha: root.alpha
      });
      const layerSnapshot = (root) => Object.fromEntries(
        ['far-environment', 'floor', 'structural-walls', 'environment-fx', 'actors', 'combat-fx', 'overlays']
          .map((name) => [name, { x: root.layers[name].position.x, y: root.layers[name].position.y }])
      );
      return {
        action: dungeonRenderer.transition?.action,
        duration: dungeonRenderer.transition?.duration,
        progress: dungeonRenderer.transition ? dungeonRenderer.transition.elapsed / dungeonRenderer.transition.duration : null,
        outgoingRoot: rootSnapshot(dungeonRenderer.transitionScene),
        incomingRoot: rootSnapshot(dungeonRenderer.scene),
        outgoingLayers: layerSnapshot(dungeonRenderer.transitionScene),
        incomingLayers: layerSnapshot(dungeonRenderer.scene),
        shakeTime: dungeonRenderer.shakeTime,
        frame: document.querySelector('#dungeon-canvas').toDataURL()
      };
    }, { action });
    console.log(`[issue-1238] ${action} mid ${JSON.stringify({ ...mid, frame: undefined })}`);
    await captureDataUrl(testInfo, `pixi-${action}-mid`, mid.frame);
    delete mid.frame;
    const after = await page.evaluate(() => {
      const { dungeonRenderer } = window.__issue1238;
      dungeonRenderer.update(63);
      dungeonRenderer.draw();
      return {
        active: Boolean(dungeonRenderer.transition),
        sceneX: dungeonRenderer.scene.position.x,
        sceneY: dungeonRenderer.scene.position.y,
        rotation: dungeonRenderer.scene.rotation,
        scaleX: dungeonRenderer.scene.scale.x,
        scaleY: dungeonRenderer.scene.scale.y,
        shakeTime: dungeonRenderer.shakeTime
      };
    });
    await capture(page, testInfo, `pixi-${action}-after`);
    results[action] = { mid, after };
  }

  expect(results.forward.mid.duration).toBe(100);
  for (const result of Object.values(results)) {
    for (const root of [result.mid.outgoingRoot, result.mid.incomingRoot]) {
      expect(root.x).toBe(0);
      expect(root.y).toBe(0);
      expect(root.rotation).toBe(0);
      expect(root.scaleX).toBe(1);
      expect(root.scaleY).toBe(1);
    }
    const allLayers = [result.mid.outgoingLayers, result.mid.incomingLayers];
    for (const layers of allLayers) {
      for (const name of ['actors', 'combat-fx', 'overlays']) {
        expect(layers[name].x).toBe(0);
        expect(layers[name].y).toBe(0);
      }
    }
  }
  for (const result of Object.values(results)) {
    expect(result.after.active).toBe(false);
    expect(result.after.sceneX).toBe(0);
    expect(result.after.sceneY).toBe(0);
    expect(result.after.rotation).toBe(0);
    expect(result.after.scaleX).toBe(1);
    expect(result.after.scaleY).toBe(1);
    expect(result.after.shakeTime).toBe(0);
  }
});

test('PixiJS reduced motion disables navigation, shake, and ambient redraw while preserving timing @smoke @e2e', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await setExploreState(page);
  const evidence = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const inputBefore = dungeonRenderer.getRenderInput();
    dungeonRenderer.beginNavigationTransition('forward', inputBefore);
    state.y = 3; state.mapRevision += 1;
    dungeonRenderer.triggerShake(20, 400);
    dungeonRenderer.triggerHitFeedback(220);
    dungeonRenderer.update(1); dungeonRenderer.draw();
    return {
      transition: dungeonRenderer.transition,
      shakeTime: dungeonRenderer.shakeTime,
      hitTime: dungeonRenderer.hitTime,
      sceneX: dungeonRenderer.scene.position.x,
      sceneY: dungeonRenderer.scene.position.y,
      rotation: dungeonRenderer.scene.rotation,
      scaleX: dungeonRenderer.scene.scale.x,
      scaleY: dungeonRenderer.scene.scale.y,
      animating: dungeonRenderer.isAnimating(dungeonRenderer.getRenderInput())
    };
  });
  await capture(page, testInfo, 'pixi-reduced-motion');
  expect(evidence.transition).toBeNull();
  expect(evidence.shakeTime).toBe(0);
  expect(evidence.hitTime).toBe(0);
  expect(evidence.sceneX).toBe(0);
  expect(evidence.sceneY).toBe(0);
  expect(evidence.rotation).toBe(0);
  expect(evidence.scaleX).toBe(1);
  expect(evidence.scaleY).toBe(1);
  expect(evidence.animating).toBe(false);
});

test('PixiJS navigation replacement, repeated input, resize, combat feedback, and disposal stay bounded @smoke @e2e', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await setExploreState(page);
  const evidence = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const input = dungeonRenderer.getRenderInput();
    const before = JSON.stringify({ x: state.x, y: state.y, dir: state.dir, mapRevision: state.mapRevision });
    const firstRenderMs = dungeonRenderer.lastRenderMs;
    const rootTransformSamples = [];
    const recordRootTransform = () => rootTransformSamples.push({
      x: dungeonRenderer.scene.position.x,
      y: dungeonRenderer.scene.position.y,
      rotation: dungeonRenderer.scene.rotation,
      scaleX: dungeonRenderer.scene.scale.x,
      scaleY: dungeonRenderer.scene.scale.y
    });
    const forwardRenderMs = [];
    for (let index = 0; index < 20; index += 1) {
      dungeonRenderer.beginNavigationTransition('forward', input);
      dungeonRenderer.update(125); dungeonRenderer.draw(input);
      recordRootTransform();
      forwardRenderMs.push(dungeonRenderer.lastRenderMs);
    }
    const turnRenderMs = [];
    for (let index = 0; index < 20; index += 1) {
      dungeonRenderer.beginNavigationTransition('turn-left', input);
      dungeonRenderer.update(125); dungeonRenderer.draw(input);
      recordRootTransform();
      turnRenderMs.push(dungeonRenderer.lastRenderMs);
    }
    for (let index = 0; index < 20; index += 1) {
      dungeonRenderer.beginNavigationTransition('turn-right', input);
      dungeonRenderer.update(125); dungeonRenderer.draw(input);
      recordRootTransform();
    }
    dungeonRenderer.beginNavigationTransition('turn-left', input);
    dungeonRenderer.cancelNavigationTransition();
    const cancelled = !dungeonRenderer.transition && !dungeonRenderer.transitionScene.visible;
    dungeonRenderer.beginNavigationTransition('forward', input);
    const replacement = dungeonRenderer.transition?.action;
    const rapidAlternatingActions = ['turn-left', 'turn-right', 'turn-left', 'turn-right'];
    rapidAlternatingActions.forEach((action) => {
      dungeonRenderer.beginNavigationTransition(action, input);
      dungeonRenderer.update(16);
    });
    const rapidAlternatingAction = dungeonRenderer.transition?.action;
    dungeonRenderer.beginNavigationTransition('forward', input);
    dungeonRenderer.update(16);
    dungeonRenderer.beginNavigationTransition('turn-right', input);
    dungeonRenderer.update(16);
    const rapidForwardTurnAction = dungeonRenderer.transition?.action;
    dungeonRenderer.cancelNavigationTransition();
    const resizeRenderMs = [];
    for (let index = 0; index < 10; index += 1) {
      window.dispatchEvent(new Event('resize'));
      dungeonRenderer.draw(input);
      resizeRenderMs.push(dungeonRenderer.lastRenderMs);
    }
    dungeonRenderer.update(125);
    dungeonRenderer.draw(input);
    let combatFeedback = 0;
    const combatRenderMs = [];
    for (let index = 0; index < 10; index += 1) {
      dungeonRenderer.triggerCombatEntry();
      dungeonRenderer.triggerHitFeedback();
      dungeonRenderer.update(32);
      dungeonRenderer.draw(input);
      combatRenderMs.push(dungeonRenderer.lastRenderMs);
      if (dungeonRenderer.combatEntryTime >= 0 && dungeonRenderer.hitTime >= 0) combatFeedback += 1;
    }
    let disposed = 0;
    for (let index = 0; index < 5; index += 1) {
      const canvas = document.createElement('canvas');
      canvas.id = `pixi-1238-lifecycle-${index}`;
      document.body.appendChild(canvas);
      const { PixiDungeonRenderer } = await import('/src/pixi_renderer.js');
      const candidate = new PixiDungeonRenderer(canvas.id);
      await candidate.init();
      candidate.draw(input);
      candidate.dispose();
      if (candidate.resourceStats.destroyed) disposed += 1;
      canvas.remove();
    }
    return {
      stateUnchanged: before === JSON.stringify({ x: state.x, y: state.y, dir: state.dir, mapRevision: state.mapRevision }),
      cancelled,
      replacement,
      rapidAlternatingAction,
      rapidForwardTurnAction,
      combatFeedback,
      firstRenderMs,
      forwardRenderMs,
      turnRenderMs,
      combatRenderMs,
      resizeRenderMs,
      rootTransformSamples,
      disposed,
      sceneChildren: dungeonRenderer.scene.children.length,
      maxChildren: dungeonRenderer.resourceStats.maxChildren,
      maxRenderMs: dungeonRenderer.maxRenderMs,
      transitionActive: Boolean(dungeonRenderer.transition)
    };
  });
  console.log(`[issue-1238] lifecycle ${JSON.stringify(evidence)}`);
  expect(evidence.stateUnchanged).toBe(true);
  expect(evidence.cancelled).toBe(true);
  expect(evidence.replacement).toBe('forward');
  expect(evidence.rapidAlternatingAction).toBe('turn-right');
  expect(evidence.rapidForwardTurnAction).toBe('turn-right');
  expect(evidence.rootTransformSamples).toHaveLength(60);
  expect(evidence.rootTransformSamples.every((root) => (
    root.x === 0 && root.y === 0 && root.rotation === 0 && root.scaleX === 1 && root.scaleY === 1
  ))).toBe(true);
  expect(evidence.combatFeedback).toBe(10);
  expect(evidence.disposed).toBe(5);
  expect(evidence.sceneChildren).toBe(8);
  expect(evidence.maxChildren).toBeLessThan(12);
  expect(evidence.maxRenderMs).toBeLessThan(100);
  expect(evidence.firstRenderMs).toBeLessThan(100);
  expect(Math.max(...evidence.forwardRenderMs)).toBeLessThan(100);
  expect(Math.max(...evidence.turnRenderMs)).toBeLessThan(100);
  expect(Math.max(...evidence.combatRenderMs)).toBeLessThan(100);
  expect(Math.max(...evidence.resizeRenderMs)).toBeLessThan(100);
  expect(evidence.transitionActive).toBe(false);
});

test('PixiJS combat feedback remains localized instead of shaking the viewport @smoke @visual', async ({ page }, testInfo) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await setExploreState(page);
  const evidence = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    state.gameState = 'combat';
    state.combatState = { phase: 'choose_actions', monsters: [
      { name: 'Test Biter', hp: 10, maxHp: 10, level: 1, color: '#58d6e8', spriteType: 'biter' }
    ] };
    dungeonRenderer.triggerCombatEntry();
    dungeonRenderer.triggerHitFeedback();
    dungeonRenderer.addDamageText('8', '#ff3b30');
    dungeonRenderer.update(80); dungeonRenderer.draw();
    const scene = dungeonRenderer.scene;
    return {
      shakeTime: dungeonRenderer.shakeTime,
      sceneX: scene.position.x,
      sceneY: scene.position.y,
      combatFxChildren: scene.layers['combat-fx'].children.length,
      actorChildren: scene.layers.actors.children.length,
      damageTexts: dungeonRenderer.damageTexts.length
    };
  });
  await capture(page, testInfo, 'pixi-combat-feedback-localized');
  expect(evidence.shakeTime).toBe(0);
  expect(evidence.sceneX).toBe(0);
  expect(evidence.sceneY).toBe(0);
  expect(evidence.combatFxChildren).toBeGreaterThan(0);
  expect(evidence.actorChildren).toBeGreaterThan(0);
  expect(evidence.damageTexts).toBe(1);
});
