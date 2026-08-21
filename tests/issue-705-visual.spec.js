import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const FLOORS = [3, 5, 6, 8, 10, 11, 13, 18, 23, 28];

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
  test(`Issue #705 visual boundaries remain distinct at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const evidence = {};
    for (const floor of FLOORS) {
      evidence[floor] = await renderFloor(page, floor);
      await page.screenshot({
        path: `output/playwright/issue-705-${viewport.width}-B${floor}.png`,
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
    console.log(`[issue-705:${viewport.width}] ${JSON.stringify(evidence)}`);
  });
}
