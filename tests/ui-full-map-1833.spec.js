import { test, expect } from './fixtures/browser-health.js';

const VIEWPORT = { width: 390, height: 844 };

// A generated B2F with a partial walk, a map fragment, and every marker kind
// the full-floor map explains in its legend.
async function seedExploredFloor(page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto('/?renderer=pixi');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'pixi');
  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { generateRunFloor } = await import('/src/run_map_generator.js');
    const { EVENT_TYPES } = await import('/src/data.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const map = generateRunFloor({ runSeed: 'issue-1833', floor: 2 }).grid;
    const find = (predicate) => {
      for (let y = 0; y < map.length; y += 1) {
        for (let x = 0; x < map[y].length; x += 1) if (predicate(map[y][x], x, y)) return { x, y };
      }
      return null;
    };
    const start = find(cell => cell.type === 'stairs-up');
    const down = find(cell => cell.type === 'stairs-down');
    // Breadth-first walk through open walls from the entrance.
    const dx = [0, 1, 0, -1];
    const dy = [-1, 0, 1, 0];
    const visited = map.map(row => row.map(() => false));
    const order = [];
    const queue = [start];
    visited[start.y][start.x] = true;
    while (queue.length && order.length < 70) {
      const current = queue.shift();
      order.push(current);
      map[current.y][current.x].walls.forEach((wall, dir) => {
        const nx = current.x + dx[dir];
        const ny = current.y + dy[dir];
        if (wall || !map[ny]?.[nx] || visited[ny][nx]) return;
        visited[ny][nx] = true;
        queue.push({ x: nx, y: ny });
      });
    }
    const visitedMap = map.map(row => row.map(() => false));
    order.forEach(({ x, y }) => { visitedMap[y][x] = true; });
    const player = order[order.length - 1];
    const trapCell = order[Math.floor(order.length / 2)];
    const disabledTrapCell = order[Math.floor(order.length / 3)];
    map[trapCell.y][trapCell.x].trap = { type: 'alarm', state: 'discovered' };
    map[disabledTrapCell.y][disabledTrapCell.x].trap = { type: 'alarm', state: 'disabled' };
    // A fragment reveals the stairs down and a chest beside it.
    const fragment = [];
    for (let y = down.y - 2; y <= down.y + 2; y += 1) {
      for (let x = down.x - 2; x <= down.x + 2; x += 1) if (map[y]?.[x]) fragment.push(`${x},${y}`);
    }
    const chest = find((cell, x, y) => fragment.includes(`${x},${y}`) && cell.type !== 'stairs-down' && !cell.event);
    map[chest.y][chest.x].event = EVENT_TYPES.CHEST;
    const camp = order[order.length - 3];
    map[camp.y][camp.x].event = EVENT_TYPES.CAMP;
    const elite = find((cell, x, y) => !visitedMap[y][x] && Math.abs(x - player.x) + Math.abs(y - player.y) > 10 && cell.walls.some(wall => !wall));

    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 2;
    state.x = player.x;
    state.y = player.y;
    state.dir = 1;
    state.map = map;
    state.maps[1] = map;
    state.visitedMap = visitedMap;
    state.visitedMaps[1] = visitedMap;
    state.dungeonMemory = { ...(state.dungeonMemory || {}), mapFragments: { 2: fragment } };
    state.roamingMonsters = [{ id: 'e1833', floor: 2, x: elite.x, y: elite.y, kind: 'elite', perception: 'standard' }];
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    Object.assign(menuContext, { type: '', targetType: '', actorIdx: -1, spellName: '', prevGameState: null });
    updateUI();
    (await import('/src/renderer.js')).dungeonRenderer.draw();
  });
  await expect(page.locator('#game-container')).toHaveAttribute('data-explore-hud', /.+/);
  await expect(page.locator('#dungeon-minimap-overlay')).toHaveAttribute('data-minimap-visible', 'true');
}

async function readView(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#full-map-canvas');
    const matrix = new DOMMatrixReadOnly(getComputedStyle(canvas).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
}

test('Minimap tap opens a full-floor map with legend, pinch/drag, and a clear way back at 390x844 @smoke', async ({ page }, testInfo) => {
  await seedExploredFloor(page);
  const overlay = page.locator('#full-map-overlay');
  await expect(overlay).toBeHidden();

  const pose = await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { x: state.x, y: state.y, dir: state.dir };
  });
  await page.locator('#btn-minimap-toggle').click();
  await expect(overlay).toBeVisible();
  await expect(page.locator('#full-map-title')).toHaveText('B2F 全体地図');

  // Every marker kind on this floor is drawn and explained in the legend.
  const markers = (await overlay.getAttribute('data-markers')).split(' ');
  for (const kind of ['stairs-up', 'stairs-down', 'trap', 'trap-disabled', 'chest', 'camp', 'elite']) {
    expect(markers).toContain(kind);
  }
  const legend = page.locator('#full-map-legend .full-map-legend-item');
  for (const label of ['現在地', '既踏', '未踏（地図片）', '下り階段', '上り階段', '罠（発見）', '宝箱', '強敵']) {
    await expect(legend.filter({ hasText: label })).toBeVisible();
  }

  // The overlay covers the screen; the legend and the return button stay in view.
  const layout = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      overlay: rect('#full-map-overlay'),
      viewport: rect('#full-map-viewport'),
      legend: rect('#full-map-legend'),
      back: rect('#btn-full-map-back'),
      close: rect('#btn-full-map-close'),
      container: document.querySelector('#game-container').getBoundingClientRect().toJSON(),
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  // The overlay fills the game frame (inside its 1px border).
  expect(layout.overlay.width).toBeGreaterThanOrEqual(layout.container.width - 2);
  expect(layout.overlay.height).toBeGreaterThanOrEqual(layout.container.height - 2);
  expect(layout.viewport.height).toBeGreaterThanOrEqual(400);
  expect(layout.legend.bottom).toBeLessThanOrEqual(layout.back.top);
  expect(layout.back.bottom).toBeLessThanOrEqual(layout.height);
  expect(layout.back.height).toBeGreaterThanOrEqual(44);
  expect(layout.close.width).toBeGreaterThanOrEqual(44);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);

  await testInfo.attach('issue-1833-full-map-390', { body: await page.screenshot({ path: testInfo.outputPath('issue-1833-full-map-390.png') }), contentType: 'image/png' });

  // Movement input does nothing while the map is open.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    return { x: state.x, y: state.y, dir: state.dir };
  })).toEqual(pose);

  // Drag pans the map.
  const box = await page.locator('#full-map-viewport').boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.locator('#btn-full-map-zoom-in').click();
  const beforeDrag = await readView(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 60, centre.y + 40, { steps: 4 });
  await page.mouse.up();
  const afterDrag = await readView(page);
  expect(afterDrag.scale).toBeCloseTo(beforeDrag.scale, 5);
  expect(Math.abs(afterDrag.x - beforeDrag.x) + Math.abs(afterDrag.y - beforeDrag.y)).toBeGreaterThan(20);

  // Two-finger pinch zooms around the fingers.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 })),
  });
  await page.locator('#btn-full-map-fit').click();
  const beforePinch = await readView(page);
  await touch('touchStart', [[centre.x - 30, centre.y], [centre.x + 30, centre.y]]);
  for (const spread of [45, 65, 90]) {
    await touch('touchMove', [[centre.x - spread, centre.y], [centre.x + spread, centre.y]]);
  }
  await touch('touchEnd', []);
  const afterPinch = await readView(page);
  expect(afterPinch.scale).toBeGreaterThan(beforePinch.scale * 1.5);

  await testInfo.attach('issue-1833-full-map-zoomed-390', { body: await page.screenshot({ path: testInfo.outputPath('issue-1833-full-map-zoomed-390.png') }), contentType: 'image/png' });

  // One tap returns to exploration with the pose unchanged; Escape closes too.
  await page.locator('#btn-full-map-back').click();
  await expect(overlay).toBeHidden();
  await expect(page.locator('#game-container')).toHaveAttribute('data-explore-hud', /.+/);
  await page.locator('#btn-minimap-toggle').click();
  await expect(overlay).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  await page.locator('#btn-minimap-toggle').click();
  await page.locator('#btn-full-map-close').click();
  await expect(overlay).toBeHidden();

  // Exploration input works again immediately.
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(async () => (await import('/src/state.js')).state.dir)).toBe((pose.dir + 1) % 4);
});

test('Full-floor map closes itself when exploration ends @smoke', async ({ page }) => {
  await seedExploredFloor(page);
  await page.locator('#btn-minimap-toggle').click();
  await expect(page.locator('#full-map-overlay')).toBeVisible();
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.gameState = 'combat';
    state.combatState = { phase: 'choose_actions', monsters: [{ name: '検証敵', level: 1, hp: 100, maxHp: 100, magicResist: 0, color: '#00e5ff', spriteType: 'biter' }] };
    updateUI();
  });
  await expect(page.locator('#full-map-overlay')).toBeHidden();
  await expect(page.locator('#btn-minimap-toggle')).toBeHidden();
});
