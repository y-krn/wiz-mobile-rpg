import { test, expect } from './fixtures/browser-health.js';

const EVIDENCE_VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 320, height: 568, label: '320' },
  { width: 430, height: 932, label: '430' },
];

function makeChestMap() {
  const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
    walls: [true, true, true, true],
    blockEnter: [false, false, false, false],
    type: 'empty',
    event: null,
  })));
  map[4][4].walls[0] = false;
  map[3][4].walls[2] = false;
  map[3][4].event = 'chest';
  return map;
}

async function seedChest(page, renderer, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`/?renderer=${renderer}`);
  if (renderer === 'pixi') await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async map => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.dir = 0;
    state.map = map;
    state.maps[0] = map;
    state.visitedMap = map.map(row => row.map(() => true));
    state.visitedMaps[0] = state.visitedMap;
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
  }, makeChestMap());
  await page.waitForTimeout(100);
}

async function captureLegacyChest(page, renderer, testInfo, label) {
  await page.evaluate(async rendererName => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getProjectionColumn, getProjectionPlanes } = await import('/src/rules/renderer_projection.js');
    const input = dungeonRenderer.getRenderInput();
    const projection = getProjectionPlanes(input.visual.geometry, dungeonRenderer.viewport);
    const plane = getProjectionColumn(projection, 1);
    const width = plane.rightBottom - plane.leftBottom;
    const chestWidth = width * 0.28;
    const x = (plane.leftBottom + plane.rightBottom - chestWidth) / 2;
    const y = plane.bottom - width * 0.22;

    if (rendererName === 'canvas') {
      const ctx = document.querySelector('#dungeon-canvas').getContext('2d');
      const original = dungeonRenderer.drawChestIcon;
      dungeonRenderer.drawChestIcon = () => {};
      dungeonRenderer.draw();
      dungeonRenderer.drawChestIcon = original;
      ctx.fillStyle = '#8a5a2b';
      ctx.strokeStyle = '#ffd60a';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, chestWidth, width * 0.10);
      ctx.strokeRect(x, y, chestWidth, width * 0.10);
      return;
    }

    const original = dungeonRenderer.drawLandmark;
    dungeonRenderer.drawLandmark = () => {};
    dungeonRenderer.draw();
    dungeonRenderer.drawLandmark = original;
    const { Graphics } = await import('/src/pixi_renderer.js');
    const graphic = new Graphics();
    graphic.rect(x, y, chestWidth, width * 0.10).fill({ color: '#8a5a2b', alpha: 0.92 });
    graphic.rect(x, y, chestWidth, width * 0.10).stroke({ color: '#ffd60a', width: 1.2 });
    dungeonRenderer.layer('actors').addChild(graphic);
    dungeonRenderer.app.render();
  }, renderer);
  const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1383-before-${renderer}-${label}.png`) });
  await testInfo.attach(`issue-1383-before-${renderer}-${label}`, { body: screenshot, contentType: 'image/png' });
}

async function captureAfter(page, renderer, testInfo, label) {
  const evidence = await page.evaluate(async rendererName => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const { getChestPropGeometry } = await import('/src/chest_prop.js');
    const { getProjectionColumn, getProjectionPlanes } = await import('/src/rules/renderer_projection.js');
    dungeonRenderer.draw();
    const input = dungeonRenderer.getRenderInput();
    const projection = getProjectionPlanes(input.visual.geometry, dungeonRenderer.viewport);
    const geometry = getChestPropGeometry(getProjectionColumn(projection, 1), input.visual.landmarks.chestStyle);
    return {
      renderer: rendererName,
      viewport: dungeonRenderer.viewport,
      chest: {
        bodyPoints: geometry.body.length,
        lidPoints: geometry.lid.length,
        lockWidth: geometry.lock.width,
        floorShadowRadius: geometry.shadow.radiusX,
        width: geometry.width,
        height: geometry.bodyHeight + geometry.lidHeight,
      },
    };
  }, renderer);
  const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath(`issue-1383-after-${renderer}-${label}.png`) });
  await testInfo.attach(`issue-1383-after-${renderer}-${label}`, { body: screenshot, contentType: 'image/png' });
  return evidence;
}

test('Dungeon treasure chest prop stays readable and paired across renderers at mobile widths @visual', async ({ page }, testInfo) => {
  const evidence = {};
  for (const renderer of ['canvas', 'pixi']) {
    for (const viewport of EVIDENCE_VIEWPORTS) {
      if (renderer === 'pixi' && viewport.label !== '390') continue;
      await seedChest(page, renderer, viewport);
      if (viewport.label === '390') await captureLegacyChest(page, renderer, testInfo, viewport.label);
      evidence[`${renderer}-${viewport.label}`] = await captureAfter(page, renderer, testInfo, viewport.label);
    }
  }

  for (const entry of Object.values(evidence)) {
    expect(entry.chest.bodyPoints).toBeGreaterThanOrEqual(4);
    expect(entry.chest.lidPoints).toBeGreaterThanOrEqual(4);
    expect(entry.chest.lockWidth).toBeGreaterThan(0);
    expect(entry.chest.floorShadowRadius).toBeGreaterThan(0);
    expect(entry.chest.width).toBeGreaterThan(4);
    expect(entry.chest.height).toBeGreaterThan(4);
  }
  expect(evidence['canvas-390'].chest.width).toBeCloseTo(evidence['pixi-390'].chest.width, 3);
  expect(evidence['canvas-390'].chest.height).toBeCloseTo(evidence['pixi-390'].chest.height, 3);
});
