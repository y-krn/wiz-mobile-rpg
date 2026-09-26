import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };
const SAVE_KEY = 'mobile_wiz_rpg_autosave';

// A 9x9 map with a north corridor from (4,6) to (4,1) and an east branch at
// (4,4), so forward, backward, and both turns all have somewhere to go.
function makeCorridorMap() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    secretDoor: [false, false, false, false],
    secretFound: [false, false, false, false],
    type: 'empty',
  })));
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const open = (x, y, direction) => {
    const [dx, dy] = directions[direction];
    map[y][x].walls[direction] = false;
    map[y + dy][x + dx].walls[(direction + 2) % 4] = false;
  };
  for (let y = 6; y > 1; y -= 1) open(4, y, 0);
  open(4, 4, 1);
  open(5, 4, 1);
  return map;
}

async function seedExplore(page, reducedMotion) {
  await page.setViewportSize(VIEWPORT);
  await page.emulateMedia({ reducedMotion });
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async (map) => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    // Encounter and roaming rolls use Math.random; a fixed stream makes the
    // motion and reduced-motion runs roll the same outcomes.
    let seed = 1766;
    Math.random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    state.party = [createStartingKitCharacter('vanguard'), createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1; state.x = 4; state.y = 4; state.dir = 0;
    state.map = map; state.maps[0] = map; state.mapRevision = (state.mapRevision || 0) + 1;
    state.visitedMap = map.map((row) => row.map(() => true));
    state.visitedMaps[0] = state.visitedMap;
    state.gameState = 'explore'; state.transitioning = false; state.combatState = null;
    Object.assign(menuContext, { type: '', targetType: '', prevGameState: null });
    updateUI();
    dungeonRenderer.cancelNavigationTransition();
    dungeonRenderer.draw();
    window.__issue1766 = { state, dungeonRenderer };
  }, makeCorridorMap());
}

test('forward, turns, and backward play a short single-scene motion at 390x844 @smoke @e2e', async ({ page }) => {
  await seedExplore(page, 'no-preference');
  const evidence = await page.evaluate(() => {
    const { state, dungeonRenderer } = window.__issue1766;
    const scene = dungeonRenderer.scene;
    const press = (id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const snapshot = () => ({
      action: dungeonRenderer.transition?.action ?? null,
      duration: dungeonRenderer.transition?.duration ?? null,
      offsetX: scene.position.x - scene.pivot.x,
      offsetY: scene.position.y - scene.pivot.y,
      scale: scene.scale.x,
      alpha: scene.alpha,
      rotation: scene.rotation,
      stageChildren: dungeonRenderer.app.stage.children.length,
      structuralWallsAlpha: scene.layers['structural-walls'].alpha,
    });
    const step = (ms) => { dungeonRenderer.update(ms); dungeonRenderer.draw(); return snapshot(); };
    const settle = () => { dungeonRenderer.update(1000); dungeonRenderer.draw(); };
    const run = (id) => {
      const pose = { x: state.x, y: state.y, dir: state.dir };
      press(id);
      // Rules resolve on the press; only the view is still moving.
      const resolved = { x: state.x, y: state.y, dir: state.dir };
      const started = snapshot();
      const samples = [step(45), step(45), step(45)];
      const animating = dungeonRenderer.isAnimating();
      settle();
      return { pose, resolved, started, samples, animating, end: snapshot() };
    };
    return {
      forward: run('btn-move-forward'),
      turnLeft: run('btn-turn-left'),
      turnRight: run('btn-turn-right'),
      backward: run('btn-move-backward'),
    };
  });

  const { forward, turnLeft, turnRight, backward } = evidence;
  expect(forward.resolved).toEqual({ x: 4, y: 3, dir: 0 });
  expect(forward.started.action).toBe('forward');
  expect(forward.started.duration).toBeGreaterThanOrEqual(150);
  expect(forward.started.duration).toBeLessThanOrEqual(220);
  expect(forward.animating).toBe(true);
  // Pushes in toward the vanishing point and bobs a few pixels.
  expect(forward.samples[0].scale).toBeGreaterThan(1);
  expect(forward.samples[2].scale).toBeGreaterThan(forward.samples[0].scale);
  expect(Math.max(...forward.samples.map((sample) => Math.abs(sample.offsetY)))).toBeGreaterThan(0.5);
  expect(Math.max(...forward.samples.map((sample) => Math.abs(sample.offsetY)))).toBeLessThanOrEqual(3);

  expect(turnLeft.resolved.dir).toBe(3);
  expect(turnLeft.started.action).toBe('turn-left');
  // Turning left flows the view right, then the new facing arrives from the left.
  expect(turnLeft.samples[0].offsetX).toBeGreaterThan(0);
  expect(turnLeft.samples[2].offsetX).toBeLessThan(0);
  expect(turnRight.resolved.dir).toBe(0);
  expect(turnRight.samples[0].offsetX).toBeLessThan(0);
  expect(turnRight.samples[2].offsetX).toBeGreaterThan(0);

  expect(backward.resolved).toEqual({ x: 4, y: 4, dir: 0 });
  expect(backward.started.action).toBe('backward');
  expect(backward.samples[0].scale).toBeGreaterThan(1);
  expect(backward.samples[2].scale).toBeLessThan(backward.samples[0].scale);

  for (const result of [forward, turnLeft, turnRight, backward]) {
    for (const sample of result.samples) {
      // One scene, never faded, never rotated, and zoomed only enough to
      // keep the canvas covered.
      expect(sample.stageChildren).toBe(1);
      expect(sample.alpha).toBe(1);
      expect(sample.structuralWallsAlpha).toBe(1);
      expect(sample.rotation).toBe(0);
      expect(sample.scale).toBeGreaterThanOrEqual(1);
      expect(sample.scale).toBeLessThanOrEqual(1.1);
    }
    expect(result.end).toMatchObject({ action: null, offsetX: 0, offsetY: 0, scale: 1, alpha: 1 });
  }
});

async function runRapidSequence(page, reducedMotion) {
  await seedExplore(page, reducedMotion);
  await page.evaluate(() => localStorage.removeItem('mobile_wiz_rpg_autosave'));
  const sequence = [
    'btn-move-forward', 'btn-move-forward', 'btn-move-backward', 'btn-move-backward',
    'btn-turn-right', 'btn-move-forward', 'btn-turn-left', 'btn-turn-left',
    'btn-turn-left', 'btn-turn-left', 'btn-move-forward', 'btn-move-forward',
    'btn-move-forward', 'btn-turn-right', 'btn-turn-right', 'btn-move-forward',
  ];
  for (const [index, id] of sequence.entries()) {
    // Alternate same-frame bursts with presses that land mid-motion.
    await page.locator(`#${id}`).dispatchEvent('pointerdown');
    if (index % 3 === 2) await page.waitForTimeout(60);
  }
  return page.evaluate((key) => {
    const { state, dungeonRenderer } = window.__issue1766;
    const save = JSON.parse(localStorage.getItem(key));
    return {
      pose: { floor: state.floor, x: state.x, y: state.y, dir: state.dir, gameState: state.gameState },
      steps: state.currentRun.steps,
      floorSteps: state.currentRun.floorSteps,
      roaming: JSON.stringify(state.roamingMonsters ?? null),
      combat: state.combatState ? state.combatState.monsters.map((monster) => monster.name) : null,
      save: { x: save.x, y: save.y, dir: save.dir, floor: save.floor, gameState: save.gameState, currentRun: JSON.stringify(save.currentRun) },
      transitionAction: dungeonRenderer.transition?.action ?? null,
    };
  }, SAVE_KEY);
}

test('rapid navigation resolves the same position, turns, encounters, and autosave with and without motion @smoke @e2e', async ({ page }) => {
  const moving = await runRapidSequence(page, 'no-preference');
  const still = await runRapidSequence(page, 'reduce');
  expect(moving.steps).toBeGreaterThan(0);
  expect(still.transitionAction).toBeNull();
  expect({ ...moving, transitionAction: null }).toEqual(still);
});

test('reduced motion switches the view immediately on navigation @smoke @e2e', async ({ page }) => {
  await seedExplore(page, 'reduce');
  const evidence = await page.evaluate(() => {
    const { state, dungeonRenderer } = window.__issue1766;
    const scene = dungeonRenderer.scene;
    const results = [];
    for (const id of ['btn-move-forward', 'btn-turn-left', 'btn-turn-right', 'btn-move-backward']) {
      document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      dungeonRenderer.update(16);
      dungeonRenderer.draw();
      results.push({
        transition: dungeonRenderer.transition,
        animating: dungeonRenderer.isAnimating(),
        pose: { x: state.x, y: state.y, dir: state.dir },
        root: { x: scene.position.x, y: scene.position.y, pivotX: scene.pivot.x, pivotY: scene.pivot.y, scale: scene.scale.x, alpha: scene.alpha },
      });
    }
    return results;
  });
  expect(evidence.map((result) => result.pose)).toEqual([
    { x: 4, y: 3, dir: 0 }, { x: 4, y: 3, dir: 3 }, { x: 4, y: 3, dir: 0 }, { x: 4, y: 4, dir: 0 },
  ]);
  for (const result of evidence) {
    expect(result.transition).toBeNull();
    expect(result.animating).toBe(false);
    expect(result.root).toEqual({ x: 0, y: 0, pivotX: 0, pivotY: 0, scale: 1, alpha: 1 });
  }
});

test('combat entry and event scenes cut a running navigation motion at once @smoke @e2e', async ({ page }) => {
  await seedExplore(page, 'no-preference');
  const evidence = await page.evaluate(async () => {
    const { state, dungeonRenderer } = window.__issue1766;
    const press = (id) => document.getElementById(id).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    press('btn-move-forward');
    const startedForward = dungeonRenderer.transition?.action ?? null;
    // An encounter on arrival: the combat scene must draw on the next frame.
    state.gameState = 'combat';
    state.combatState = { phase: 'choose_actions', monsters: [
      { name: 'Test Biter', hp: 10, maxHp: 10, level: 1, color: '#58d6e8', spriteType: 'biter' },
    ] };
    dungeonRenderer.triggerCombatEntry();
    const afterCombatEntry = dungeonRenderer.transition;
    dungeonRenderer.update(16); dungeonRenderer.draw();
    const combatActors = dungeonRenderer.scene.layers.actors.children.length;

    state.gameState = 'explore'; state.combatState = null;
    dungeonRenderer.draw();
    press('btn-turn-left');
    const startedTurn = dungeonRenderer.transition?.action ?? null;
    // A chest or trap scene opening mid-turn also ends the motion.
    state.gameState = 'chest';
    dungeonRenderer.update(16); dungeonRenderer.draw();
    const afterChest = dungeonRenderer.transition;
    const scene = dungeonRenderer.scene;
    return {
      startedForward,
      afterCombatEntry,
      combatActors,
      startedTurn,
      afterChest,
      root: { offsetX: scene.position.x - scene.pivot.x, scale: scene.scale.x },
    };
  });
  expect(evidence.startedForward).toBe('forward');
  expect(evidence.afterCombatEntry).toBeNull();
  expect(evidence.combatActors).toBeGreaterThan(0);
  expect(evidence.startedTurn).toBe('turn-left');
  expect(evidence.afterChest).toBeNull();
  expect(evidence.root).toEqual({ offsetX: 0, scale: 1 });
});
