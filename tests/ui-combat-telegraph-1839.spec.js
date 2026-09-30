import { test, expect } from './fixtures/browser-health.js';

// A telegraphed enemy action shows a "! 予告" badge above that enemy's sprite, so
// the warning reads even when the log line is clipped. The badge blinks
// normally and stays at full strength under reduced motion (#1839).
const MONSTERS = Object.freeze([
  { name: '火薬コウモリ', spriteType: 'bat', level: 2, hp: 4, maxHp: 20, color: '#d17b4d', traits: ['selfDestruct'], selfDestructQueued: true },
  { name: '群れネズミ', spriteType: 'biter', level: 1, hp: 18, maxHp: 18, color: '#8a7658' },
]);

async function seedCombat(page, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=pixi');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async (monsters) => {
    const { state, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
      walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty',
    })));
    state.party = [createStartingKitCharacter('vanguard')];
    state.map = map; state.maps[0] = map; state.visitedMaps[0] = map.map(row => row.map(() => true));
    state.floor = 1; state.x = 4; state.y = 4; state.dir = 0;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'combat';
    state.transitioning = false;
    state.combatState = { phase: 'choose_actions', monsters: monsters.map(monster => ({ ...monster })), isBoss: false };
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
  }, MONSTERS);
}

async function sampleMarkers(page) {
  return page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const samples = [];
    for (const step of [0, 120, 240, 360]) {
      dungeonRenderer.update(step);
      dungeonRenderer.draw();
      samples.push(dungeonRenderer.telegraphMarkers.map(marker => ({ ...marker })));
    }
    const anchors = Object.fromEntries([...dungeonRenderer.combatAnchors].map(([index, anchor]) => [index, anchor]));
    const badges = dungeonRenderer.scene.layers['combat-fx'].children.filter(child => child.label?.startsWith('telegraph-')).map(child => child.label);
    return { samples, anchors, badges, animating: dungeonRenderer.isAnimating() };
  });
}

test('telegraphing enemy shows a blinking badge above its sprite @smoke', async ({ page }, testInfo) => {
  await seedCombat(page, 'no-preference');
  const { samples, anchors, badges, animating } = await sampleMarkers(page);
  expect(badges).toEqual(['telegraph-0']);
  for (const markers of samples) {
    expect(markers.map(marker => marker.monsterIndex)).toEqual([0]);
    const [marker] = markers;
    // Above the telegraphing enemy, not the idle one, and inside the canvas.
    expect(Math.abs(marker.x - anchors[0].x)).toBeLessThan(1);
    expect(Math.abs(marker.x - anchors[1].x)).toBeGreaterThan(20);
    expect(marker.y).toBeLessThan(anchors[0].y);
    expect(marker.y - marker.radius).toBeGreaterThanOrEqual(0);
  }
  const alphas = samples.map(([marker]) => marker.alpha);
  expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(0.05);
  expect(Math.min(...alphas)).toBeGreaterThanOrEqual(0.5);
  expect(animating).toBe(true);
  await testInfo.attach('issue-1839-telegraph-390x844.png', {
    body: await page.locator('#dungeon-canvas').screenshot(), contentType: 'image/png',
  });
});

test('telegraph badge stays visible without motion under reduced motion @smoke', async ({ page }, testInfo) => {
  await seedCombat(page, 'reduce');
  const { samples, badges, animating } = await sampleMarkers(page);
  expect(badges).toEqual(['telegraph-0']);
  expect(samples.map(([marker]) => marker.alpha)).toEqual([1, 1, 1, 1]);
  expect(animating).toBe(false);
  await testInfo.attach('issue-1839-telegraph-reduced-motion-390x844.png', {
    body: await page.locator('#dungeon-canvas').screenshot(), contentType: 'image/png',
  });
});

test('telegraph badge clears once the queued action resolves', async ({ page }) => {
  await seedCombat(page, 'no-preference');
  const badges = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    state.combatState.monsters[0].selfDestructQueued = false;
    dungeonRenderer.draw();
    return { markers: dungeonRenderer.telegraphMarkers.length };
  });
  expect(badges.markers).toBe(0);
});
