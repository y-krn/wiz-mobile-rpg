import { test, expect } from './fixtures/browser-health.js';
import './dungeon-landmarks.cases.js';
import './dungeon-chest.cases.js';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const FLOORS = [3, 5, 6, 8, 10, 11, 13, 18, 23, 28];
const REPRESENTATIVE_FLOORS = [1, 6, 11, 16, 21, 26];

async function renderFloor(page, floor) {
  return page.evaluate(async (targetFloor) => {
    const { state, createDefaultCurrentRun } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui/ui_root.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const makeCell = () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      type: 'empty',
    });
    const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, makeCell));
    map[5][4].walls[0] = true;
    map[5][6].walls[0] = true;
    state.currentRun = createDefaultCurrentRun();
    state.floor = targetFloor;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.gameState = 'explore';
    state.maps[targetFloor - 1] = map;
    state.visitedMaps[targetFloor - 1] = map.map(row => row.map(() => true));
    state.map = map;
    updateUI();
    dungeonRenderer.draw();

    const container = document.querySelector('#game-container');
    const canvas = document.querySelector('#dungeon-canvas');
    const ctx = canvas.getContext('2d');
    const expected = getComputedStyle(container).getPropertyValue('--biome-wall-color').trim();
    const rgb = expected.match(/^#([0-9a-f]{6})$/i);
    const target = rgb ? rgb[1].match(/../g).map(value => parseInt(value, 16)) : null;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let matchingPixels = 0;
    if (target) {
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.abs(pixels[index] - target[0]) <= 3 &&
            Math.abs(pixels[index + 1] - target[1]) <= 3 &&
            Math.abs(pixels[index + 2] - target[2]) <= 3) matchingPixels++;
      }
    }
    return {
      cssWallColor: expected,
      cssDepth: getComputedStyle(container).getPropertyValue('--depth-corruption').trim(),
      matchingPixels,
      floorClass: [...container.classList].find(name => name.startsWith('floor-theme-')),
    };
  }, floor);
}

for (const viewport of VIEWPORTS) {
  test(`Dungeon biome visual boundaries remain distinct at ${viewport.width}px @visual`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const evidence = {};
    for (const floor of FLOORS) {
      evidence[floor] = await renderFloor(page, floor);
      await page.screenshot({
        path: `output/playwright/dungeon-theme-${viewport.width}-B${floor}.png`,
        fullPage: true,
      });
      expect(evidence[floor].matchingPixels, `B${floor} wall signature should be visible`).toBeGreaterThan(0);
    }

    expect(evidence[5].cssWallColor).not.toBe(evidence[6].cssWallColor);
    expect(evidence[10].cssWallColor).not.toBe(evidence[11].cssWallColor);
    expect(evidence[3].floorClass).toBe('floor-theme-b1');
    expect(evidence[28].floorClass).toBe('floor-theme-b6');
    for (let index = 1; index < FLOORS.length; index++) {
      expect(Number(evidence[FLOORS[index]].cssDepth)).toBeGreaterThan(Number(evidence[FLOORS[index - 1]].cssDepth));
    }
    console.log(`[dungeon-theme:${viewport.width}] ${JSON.stringify(evidence)}`);
  });
}

test('Dungeon theme clears inline variables when leaving an active run @visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const evidence = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui/ui_root.js');
    const container = document.querySelector('#game-container');
    const floorThemeStyleProperties = [
      '--biome-wall-color',
      '--biome-glow',
      '--biome-background',
      '--biome-header-background',
      '--biome-banner-background',
      '--biome-aura',
      '--biome-aura-opacity',
      '--depth-corruption',
    ];
    const makeCell = () => ({
      walls: [false, false, false, false],
      blockEnter: [false, false, false, false],
      secretDoor: [false, false, false, false],
      type: 'empty',
    });
    const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, makeCell));
    state.currentRun = createDefaultCurrentRun();
    state.floor = 6;
    state.x = 5;
    state.y = 5;
    state.dir = 0;
    state.gameState = 'explore';
    state.maps[5] = map;
    state.visitedMaps[5] = map.map(row => row.map(() => true));
    state.map = map;
    updateUI();
    const active = {
      wall: getComputedStyle(container).getPropertyValue('--biome-wall-color').trim(),
      depth: getComputedStyle(container).getPropertyValue('--depth-corruption').trim(),
    };

    state.currentRun = null;
    state.gameState = 'town';
    updateUI();
    const townInline = Object.fromEntries(floorThemeStyleProperties.map(property => [
      property,
      container.style.getPropertyValue(property),
    ]));

    state.currentRun = createDefaultCurrentRun();
    state.floor = 11;
    state.gameState = 'explore';
    updateUI();
    const activeAgain = {
      wall: getComputedStyle(container).getPropertyValue('--biome-wall-color').trim(),
      depth: getComputedStyle(container).getPropertyValue('--depth-corruption').trim(),
    };

    state.gameState = 'result';
    updateUI();
    const resultInline = Object.fromEntries(floorThemeStyleProperties.map(property => [
      property,
      container.style.getPropertyValue(property),
    ]));

    return { active, townInline, activeAgain, resultInline };
  });

  expect(evidence.active.wall).toBe('#d5b56f');
  expect(Number(evidence.active.depth)).toBeGreaterThan(0);
  expect(evidence.activeAgain.wall).toBe('#bd78f2');
  expect(Number(evidence.activeAgain.depth)).toBeGreaterThan(Number(evidence.active.depth));
  expect(Object.values(evidence.townInline).every(value => value === '')).toBe(true);
  expect(Object.values(evidence.resultInline).every(value => value === '')).toBe(true);
});

for (const viewport of VIEWPORTS) {
  test(`Representative biome renderer output remains distinct at ${viewport.width}px @visual`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const evidence = {};
    for (const floor of REPRESENTATIVE_FLOORS) {
      evidence[floor] = await page.evaluate(async targetFloor => {
        const { state, createDefaultCurrentRun } = await import('/src/state.js');
        const { dungeonRenderer, getProjectionColumn, getProjectionPlanes } = await import('/src/renderer.js');
        const { getFloorTheme } = await import('/src/data/floor_themes.js');
        const makeCell = () => ({
          walls: [false, false, false, false],
          blockEnter: [false, false, false, false],
          secretDoor: [false, false, false, false],
          type: 'empty',
        });
        const map = Array.from({ length: 12 }, () => Array.from({ length: 12 }, makeCell));
        map[5][4].walls[0] = true;
        map[5][6].walls[0] = true;
        map[4][5].blockEnter[2] = true;
        state.currentRun = createDefaultCurrentRun();
        state.floor = targetFloor;
        state.x = 5;
        state.y = 5;
        state.dir = 0;
        state.gameState = 'explore';
        state.maps[targetFloor - 1] = map;
        state.visitedMaps[targetFloor - 1] = map.map(row => row.map(() => true));
        state.map = map;

        const geometry = getFloorTheme(targetFloor).visualSignature.geometry;
        const projection = getProjectionPlanes(geometry);
        const barrierPlane = getProjectionColumn(projection, 1);
        const canvas = document.querySelector('#dungeon-canvas');
        const ctx = canvas.getContext('2d');
        const scene = {
          showTownBackground: false,
          showCombat: false,
          showChest: false,
          showEventScene: true,
          showItemMenu: false,
        };
        const originalDateNow = Date.now;
        Date.now = () => 1700000000000;
        const render = blocked => {
          map[4][5].blockEnter[2] = blocked;
          dungeonRenderer.draw(scene);
          return new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
        };
        const withoutBarrier = render(false);
        const withBarrier = render(true);
        Date.now = originalDateNow;

        const pixelDelta = (pixels, x, y) => {
          const index = (Math.max(0, Math.min(canvas.width - 1, Math.round(x))) +
            Math.max(0, Math.min(canvas.height - 1, Math.round(y))) * canvas.width) * 4;
          return Math.abs(pixels[index] - withoutBarrier[index]) +
            Math.abs(pixels[index + 1] - withoutBarrier[index + 1]) +
            Math.abs(pixels[index + 2] - withoutBarrier[index + 2]);
        };
        let changedPixels = 0;
        for (let index = 0; index < withBarrier.length; index += 4) {
          if (withBarrier[index] !== withoutBarrier[index] ||
              withBarrier[index + 1] !== withoutBarrier[index + 1] ||
              withBarrier[index + 2] !== withoutBarrier[index + 2]) changedPixels++;
        }

        const t = 0.8;
        const leftAtT = barrierPlane.leftTop + (barrierPlane.leftBottom - barrierPlane.leftTop) * t;
        const edgeX = (barrierPlane.leftTop + leftAtT) / 2;
        const edgeY = barrierPlane.top + (barrierPlane.bottom - barrierPlane.top) * t;
        const centerX = (barrierPlane.leftTop + barrierPlane.rightTop) / 2;
        const centerY = barrierPlane.top + (barrierPlane.bottom - barrierPlane.top) / 2;
        const archHeight = Math.max(3, (barrierPlane.bottom - barrierPlane.top) * 0.12);
        return {
          geometry,
          silhouette: [
            projection.leftTop[0], projection.rightTop[0], projection.yt[0], projection.yb[0],
            projection.leftTop[1], projection.rightTop[1], projection.yt[1], projection.yb[1],
            projection.ceilingStyle,
          ],
          canvasSize: [canvas.width, canvas.height],
          changedPixels,
          centerDelta: pixelDelta(withBarrier, centerX, centerY),
          edgeDelta: pixelDelta(withBarrier, edgeX, edgeY),
          archApexDelta: pixelDelta(withBarrier, centerX, barrierPlane.top - archHeight * 0.5 + 2),
        };
      }, floor);
    }

    const baseline = { corridorWidth: 1, ceilingHeight: 1, wallLean: 0, ceilingStyle: 'flat' };
    for (const floor of REPRESENTATIVE_FLOORS) {
      const { geometry, canvasSize, changedPixels, centerDelta, edgeDelta, archApexDelta } = evidence[floor];
      const changedDimensions = ['corridorWidth', 'ceilingHeight', 'wallLean', 'ceilingStyle']
        .filter(key => geometry[key] !== baseline[key]);
      expect(changedDimensions.length, `B${floor} should change at least two geometry dimensions`).toBeGreaterThanOrEqual(2);
      expect(canvasSize).toEqual([400, 260]);
      expect(changedPixels, `B${floor} barrier should change the rendered canvas`).toBeGreaterThan(40);
      expect(centerDelta, `B${floor} barrier center should be rendered`).toBeGreaterThan(5);
      if (geometry.wallLean > 0) {
        expect(edgeDelta, `B${floor} positive lean should render the expanded lower edge`).toBeGreaterThan(5);
      }
      if (geometry.wallLean < 0) {
        expect(edgeDelta, `B${floor} negative lean should clip the contracted lower edge`).toBeLessThan(5);
      }
      if (geometry.ceilingStyle === 'arch') {
        expect(archApexDelta, `B${floor} arch barrier should render its curved apex`).toBeGreaterThan(5);
      }
    }
    expect(new Set(REPRESENTATIVE_FLOORS.map(floor => JSON.stringify(evidence[floor].silhouette))).size)
      .toBe(REPRESENTATIVE_FLOORS.length);
  });
}
