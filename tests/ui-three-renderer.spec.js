import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const TOPOLOGY_ARCHETYPES = [
  'straight-corridor',
  'dead-end',
  'left-turn',
  'right-turn',
  't-junction',
  'cross-junction',
];

test('Three.js Dungeon View keeps the four shell regions and renders at mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

    const layout = await page.evaluate(async () => {
      const canvas = document.querySelector('#dungeon-canvas');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const townSurfaces = [];
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.surface) townSurfaces.push(child.userData.surface);
      });
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
      };
      return {
        viewport: rect('#viewport-panel'),
        canvas: rect('#dungeon-canvas'),
        regions: Array.from(document.querySelectorAll('[data-shell-region]')).map((element) => element.dataset.shellRegion),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        webgl: Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl')),
        canvasSize: [canvas.width, canvas.height],
        townSurfaces,
      };
    });

    expect(layout.webgl).toBe(true);
    expect(layout.canvasSize).toEqual([400, 260]);
    expect(layout.regions).toEqual(expect.arrayContaining([
      'minimal-hud', 'dungeon-view', 'current-event-strip', 'action-dock',
    ]));
    expect(layout.canvas.width).toBeGreaterThan(0);
    expect(layout.canvas.height).toBeGreaterThan(0);
    expect(layout.townSurfaces).not.toContain('front-wall-invalid');
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.viewport.left).toBeGreaterThanOrEqual(-1);
    expect(layout.viewport.right).toBeLessThanOrEqual(layout.clientWidth + 1);
    const invalidTopologyWalls = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      let count = 0;
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.surface === 'front-wall-invalid') count += 1;
      });
      return count;
    });
    expect(invalidTopologyWalls).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`three-renderer-${viewport.width}x${viewport.height}.png`) });
  }
});

test('Three.js Dungeon View makes six local topology archetypes readable at all supported mobile widths @smoke @visual', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
    await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });
    await expect(page.locator('#dungeon-minimap-overlay')).toHaveCSS('display', 'none');

    for (const archetype of TOPOLOGY_ARCHETYPES) {
      await page.evaluate(async (name) => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => ({
          walls: [true, true, true, true],
          blockEnter: [false, false, false, false],
          type: 'empty',
        })));
        const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        const open = (x, y, dir) => {
          const [dx, dy] = directions[dir];
          map[y][x].walls[dir] = false;
          map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
        };
        const paths = {
          'straight-corridor': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 2, 0]],
          'dead-end': [[4, 4, 2]],
          'left-turn': [[4, 4, 2], [4, 4, 3], [3, 4, 3]],
          'right-turn': [[4, 4, 2], [4, 4, 1], [5, 4, 1]],
          't-junction': [[4, 4, 2], [4, 4, 3], [4, 4, 1]],
          'cross-junction': [[4, 4, 2], [4, 4, 0], [4, 3, 0], [4, 4, 1], [4, 4, 3], [5, 4, 1], [3, 4, 3]],
        };
        paths[name].forEach(([x, y, dir]) => open(x, y, dir));

        state.party = [createStartingKitCharacter('vanguard')];
        state.currentRun = createDefaultCurrentRun();
        state.floor = 1;
        state.x = 4;
        state.y = 4;
        state.dir = 0;
        state.maps[0] = map;
        state.visitedMaps[0] = map.map((row) => row.map(() => true));
        state.mapRevision = (state.mapRevision || 0) + 1;
        state.gameState = 'explore';
        state.transitioning = false;
        state.combatState = null;
        state.roamingMonsters = [];
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, archetype);

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        const { getThreeProjectedBounds } = await import('/src/three_renderer.js');
        const topology = dungeonRenderer.getSceneTopology();
        const current = topology.find(({ z, column }) => z === 0 && column === 0);
        const branchRotations = {};
        const branchMouthSides = [];
        const sideOpeningBounds = [];
        dungeonRenderer.root.traverse((child) => {
          const cell = child.userData?.topology;
          if (child.userData?.surface === 'floor' && cell?.z === 0 && Math.abs(cell.column) === 1) {
            branchRotations[cell.column] = Number(child.rotation.y.toFixed(3));
          }
          if (child.userData?.surface === 'side-branch-mouth' && cell?.z === 0 && cell?.column === 0) {
            const side = child.position.x < 0 ? 'left' : 'right';
            branchMouthSides.push(side);
            sideOpeningBounds.push({ side, bounds: getThreeProjectedBounds(child, dungeonRenderer.camera) });
          }
        });
        return {
          current: {
            leftBlocked: current.leftBlocked,
            rightBlocked: current.rightBlocked,
            frontBlocked: current.frontBlocked,
          },
          visible: topology.map(({ z, column }) => `${z}:${column}`).sort(),
          branchRotations,
          branchMouthSides: branchMouthSides.sort(),
          sideOpeningBounds,
        };
      });

      expect(evidence.current).toEqual(expect.objectContaining({
        leftBlocked: ['straight-corridor', 'dead-end', 'right-turn'].includes(archetype),
        rightBlocked: ['straight-corridor', 'dead-end', 'left-turn'].includes(archetype),
        frontBlocked: ['dead-end', 'left-turn', 'right-turn', 't-junction'].includes(archetype),
      }));
      if (archetype === 'straight-corridor') expect(evidence.visible).toContain('3:0');
      if (archetype === 'dead-end') expect(evidence.visible).toEqual(['0:0']);
      if (archetype === 'left-turn') expect(evidence.visible).toContain('0:-1');
      if (archetype === 'right-turn') expect(evidence.visible).toContain('0:1');
      if (archetype === 'left-turn') expect(evidence.branchRotations['-1']).toBeCloseTo(Math.PI / 2, 3);
      if (archetype === 'right-turn') expect(evidence.branchRotations['1']).toBeCloseTo(-Math.PI / 2, 3);
      expect(evidence.branchMouthSides).toEqual(
        archetype === 'left-turn' || archetype === 'right-turn'
          ? [archetype === 'left-turn' ? 'left' : 'right']
          : archetype === 't-junction' || archetype === 'cross-junction'
            ? ['left', 'right']
            : []
      );
      evidence.sideOpeningBounds.forEach(({ bounds }) => {
        expect(bounds.visibleWidth).toBeGreaterThan(32);
        expect(bounds.visibleHeight).toBeGreaterThan(70);
      });
      if (archetype === 't-junction') {
        expect(evidence.visible).toEqual(expect.arrayContaining(['0:-1', '0:1']));
        expect(evidence.visible).not.toContain('1:0');
      }
      if (archetype === 'cross-junction') expect(evidence.visible).toContain('2:0');

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`three-topology-${archetype}-${viewport.width}px.png`),
      });
      await testInfo.attach(`three-topology-${archetype}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }
});

test('Three.js corridor readability keeps near openings clear and mirrors biome geometry @smoke @visual', async ({ page }, testInfo) => {
  const fixtures = [
    { name: 'b1-straight', floor: 1, widths: VIEWPORTS },
    { name: 'b2-straight-arch', floor: 6, widths: [VIEWPORTS[2]] },
  ];

  for (const fixture of fixtures) {
    for (const viewport of fixture.widths) {
      await page.setViewportSize(viewport);
      await page.goto('/?renderer=three');
      await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
      await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });

      await page.evaluate(async (floor) => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        const makeCell = () => ({
          walls: [true, true, true, true],
          blockEnter: [false, false, false, false],
          type: 'empty',
        });
        const map = Array.from({ length: 11 }, () => Array.from({ length: 11 }, makeCell));
        for (const [x, y] of [[5, 5], [5, 4], [5, 3], [5, 2]]) {
          map[y][x].walls[0] = false;
          map[y - 1][x].walls[2] = false;
        }
        state.party = [createStartingKitCharacter('vanguard')];
        state.currentRun = createDefaultCurrentRun();
        state.floor = floor;
        state.x = 5;
        state.y = 5;
        state.dir = 0;
        state.maps[floor - 1] = map;
        state.visitedMaps[floor - 1] = map.map((row) => row.map(() => true));
        state.map = map;
        state.mapRevision = (state.mapRevision || 0) + 1;
        state.gameState = 'explore';
        state.transitioning = false;
        state.combatState = null;
        state.roamingMonsters = [];
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, fixture.floor);

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        const metrics = (await import('/src/three_renderer.js')).getThreeCorridorReadabilityMetrics(
          dungeonRenderer.getRenderInput().visual.geometry
        );
        let ceiling = null;
        let seamCount = 0;
        dungeonRenderer.root.traverse((child) => {
          if (child.userData?.surface === 'ceiling' && !ceiling) ceiling = child;
          if (child.userData?.surface === 'depth-seam') seamCount += 1;
        });
        const positions = ceiling?.geometry?.attributes?.position;
        const ceilingMaxY = positions
          ? Math.max(...Array.from({ length: positions.count }, (_, index) => positions.getY(index))) + (ceiling.position.y || 0)
          : null;
        return {
          metrics,
          cameraFov: dungeonRenderer.camera.fov,
          fog: { near: dungeonRenderer.scene.fog.near, far: dungeonRenderer.scene.fog.far },
          ceilingStyle: dungeonRenderer.activeProfile.ceilingStyle,
          wallHeight: dungeonRenderer.activeProfile.wallHeight,
          ceilingMaxY,
          seamCount,
        };
      });

      expect(evidence.cameraFov).toBeGreaterThanOrEqual(60);
      expect(evidence.cameraFov).toBeLessThanOrEqual(70);
      expect(evidence.metrics.forwardOpeningWidth[0]).toBeGreaterThan(100);
      expect(evidence.metrics.forwardOpeningWidth[0]).toBeGreaterThan(evidence.metrics.forwardOpeningWidth[1]);
      expect(evidence.metrics.forwardOpeningWidth[1]).toBeGreaterThan(evidence.metrics.forwardOpeningWidth[2]);
      expect(evidence.metrics.currentCellSideWallOccupancy).toBeLessThan(0.35);
      expect(evidence.fog.near).toBeGreaterThan(evidence.metrics.cellFrontDistances[0]);
      expect(evidence.fog.near).toBeLessThan(evidence.metrics.cellFrontDistances[2]);
      expect(evidence.seamCount).toBeGreaterThan(0);
      if (fixture.floor === 6) {
        expect(evidence.ceilingStyle).toBe('arch');
        expect(evidence.ceilingMaxY).toBeGreaterThan(evidence.wallHeight);
      } else {
        expect(evidence.ceilingStyle).toBe('flat');
      }

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`three-readability-${fixture.name}-${viewport.width}px.png`),
      });
      await testInfo.attach(`three-readability-${fixture.name}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }
});

test('Three.js danger cue stays outside the camera and visible in the corridor @e2e @visual', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
  await page.locator('#dungeon-minimap-overlay').evaluate((element) => { element.style.display = 'none'; });

  const evidence = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const makeCell = () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    });
    const map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, makeCell));
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 3;
    state.y = 3;
    state.dir = 0;
    state.maps[0] = map;
    state.visitedMaps[0] = map.map((row) => row.map(() => true));
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    state.roamingMonsters = [{ floor: 1, x: 3, y: 2, kind: 'elite', perception: 'visible' }];
    updateUI();
    const { dungeonRenderer } = await import('/src/renderer.js');
    dungeonRenderer.draw();
    let cue = null;
    dungeonRenderer.root.traverse((child) => {
      if (child.userData?.surface === 'danger-cue') cue = child;
    });
    return {
      cameraPosition: dungeonRenderer.camera.position.toArray().map((value) => Number(value.toFixed(3))),
      cuePosition: cue?.position.toArray().map((value) => Number(value.toFixed(3))) ?? null,
      cueRadius: cue?.geometry.parameters.radius ?? null,
      cameraToCue: cue ? dungeonRenderer.camera.position.distanceTo(cue.position) : null,
    };
  });

  expect(evidence.cuePosition).not.toBeNull();
  expect(evidence.cameraToCue).toBeGreaterThan(evidence.cueRadius);
  const screenshot = await page.locator('#dungeon-canvas').screenshot({ path: testInfo.outputPath('three-danger-cue-390px.png') });
  await testInfo.attach('three-danger-cue-390px', { body: screenshot, contentType: 'image/png' });
});

test('Canvas and Three.js share the same exploration mini-map overlay contract @e2e', async ({ page }) => {
  const measure = async (url) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url);
    await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', url.includes('renderer=three') ? 'three' : 'canvas');
    return page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { dungeonRenderer } = await import('/src/renderer.js');
      const makeCell = () => ({
        walls: [true, false, true, false],
        blockEnter: [false, false, false, false],
        type: 'empty',
        event: null,
      });
      const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
      state.party = [createStartingKitCharacter('vanguard')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 1;
      state.x = 4;
      state.y = 4;
      state.dir = 1;
      state.maps[0] = map;
      state.visitedMaps[0] = map.map((row) => row.map(() => true));
      state.mapRevision = (state.mapRevision || 0) + 1;
      state.roamingMonsters = [];
      state.lightTurns = 0;
      state.lightPower = '';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: '検証敵', level: 1, hp: 10, maxHp: 10, color: '#ff3b30' }],
      };
      state.chestState = null;
      state.transitioning = false;
      const overlay = document.querySelector('#dungeon-minimap-overlay');
      const checksum = () => Array.from(overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data)
        .reduce((sum, value) => sum + value, 0);
      const draw = () => {
        dungeonRenderer.draw();
        return {
          visible: overlay.dataset.minimapVisible === 'true',
          checksum: checksum(),
        };
      };

      state.gameState = 'explore';
      menuContext.type = '';
      menuContext.prevGameState = null;
      const explore = draw();

      state.gameState = 'combat';
      const combat = draw();

      state.gameState = 'chest';
      state.chestState = { trap: 'none' };
      const chest = draw();

      state.gameState = 'trap_encounter';
      state.chestState = null;
      const event = draw();

      state.gameState = 'submenu';
      menuContext.type = 'item_inventory';
      const item = draw();

      return {
        explore,
        hidden: [combat, chest, event, item],
        pointerEvents: getComputedStyle(overlay).pointerEvents,
      };
    });
  };

  const canvas = await measure('/');
  const three = await measure('/?renderer=three');
  expect(canvas.explore.visible).toBe(true);
  expect(three.explore.visible).toBe(true);
  expect(canvas.explore.checksum).toBeGreaterThan(0);
  expect(three.explore.checksum).toBe(canvas.explore.checksum);
  expect(canvas.hidden.every(({ visible, checksum }) => !visible && checksum === 0)).toBe(true);
  expect(three.hidden.every(({ visible, checksum }) => !visible && checksum === 0)).toBe(true);
  expect(canvas.pointerEvents).toBe('none');
  expect(three.pointerEvents).toBe('none');
});

test('Three.js Dungeon View survives orientation resize without overflow @smoke @e2e', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  await page.setViewportSize({ width: 844, height: 390 });
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('#dungeon-canvas');
    return {
      canvasSize: [canvas.width, canvas.height],
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      viewport: document.querySelector('#viewport-panel').getBoundingClientRect().toJSON(),
    };
  });
  expect(layout.canvasSize).toEqual([400, 260]);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.viewport.right).toBeLessThanOrEqual(layout.clientWidth + 1);
});

test('Three.js Dungeon View directly selects an enemy and retains an accessible fallback @smoke @e2e', async ({ page }) => {
  await page.goto('/?renderer=three');
  await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');

  await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');
    const { openCombatTargetMenu } = await import('/src/combat_ui/target_menu.js');
    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 0;
    state.y = 0;
    state.dir = 0;
    state.gameState = 'combat';
    state.transitioning = false;
    state.maps[state.floor - 1] = [[{ walls: [true, true, true, true], blockEnter: [false, false, false, false], type: 'empty' }]];
    state.visitedMaps[state.floor - 1] = [[true]];
    state.combatState = {
      phase: 'choose_actions',
      monsters: [
        { name: '強敵の検証体', level: 5, hp: 20, maxHp: 20, color: '#d45de6', spriteType: 'golem' },
        { name: '遠方の検証体', level: 1, hp: 12, maxHp: 12, color: '#58d6e8', spriteType: 'wisp' },
      ],
    };
    menuContext.actorIdx = 0;
    window.__threeTarget = null;
    openCombatTargetMenu('enemy', (targetIdx) => {
      window.__threeTarget = targetIdx;
      updateUI();
    });
    updateUI();
  });

  await expect(page.locator('.combat-target-selection-message')).toHaveText('敵をタップして対象を選択');
  await expect(page.locator('.combat-target-a11y-list')).toHaveCount(1);
  await expect(page.locator('.combat-target-a11y')).toHaveCount(2);
  await expect(page.locator('.combat-target-a11y-list')).toHaveCSS('position', 'absolute');

  const combatDepth = await page.evaluate(async () => {
    const { dungeonRenderer } = await import('/src/renderer.js');
    const surfaces = [];
    let targetZ = null;
    let monsterZ = null;
    dungeonRenderer.root.traverse((child) => {
      if (child.userData?.surface === 'front-wall' && child.userData.topology?.z === 0 && child.userData.topology?.column === 0) {
        surfaces.push({ surface: child.userData.surface, z: child.position.z });
      }
      if (child.userData?.targetIdx === 0) targetZ = child.position.z;
      if (child.userData?.sceneLayer === 'combat' && child.userData?.monsterIndex === 0) monsterZ = child.position.z;
    });
    return { frontWallZ: surfaces[0]?.z ?? null, targetZ, monsterZ };
  });
  expect(combatDepth.frontWallZ).toBeCloseTo(0.1, 5);
  expect(combatDepth.monsterZ).toBeGreaterThan(combatDepth.frontWallZ);
  expect(combatDepth.targetZ).toBeGreaterThan(combatDepth.frontWallZ);

  await page.locator('#dungeon-canvas').click({ position: { x: 180, y: 150 } });
  await expect.poll(() => page.evaluate(() => window.__threeTarget)).toBe(0);
  await expect(page.locator('#combat-overlay')).toBeHidden();
});

test('Three.js combat staging keeps enemy bodies and labels readable across portrait widths @smoke @visual', async ({ page }, testInfo) => {
  const fixtures = [
    {
      name: 'single',
      monsters: [{ name: '単体の検証敵', level: 4, hp: 24, maxHp: 24, color: '#d45de6', spriteType: 'golem' }],
    },
    {
      name: 'multi',
      monsters: [
        { name: '左の検証敵', level: 4, hp: 24, maxHp: 24, color: '#54c8c3', spriteType: 'golem' },
        { name: '右の検証敵', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
      ],
    },
    {
      name: 'trio',
      monsters: [
        { name: '左の三体目', level: 4, hp: 24, maxHp: 24, color: '#54c8c3', spriteType: 'golem' },
        { name: '中央の三体目', level: 3, hp: 20, maxHp: 20, color: '#f0a04b', spriteType: 'wisp' },
        { name: '右の三体目', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
      ],
    },
  ];

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

    for (const fixture of fixtures) {
      await page.evaluate(async (monsters) => {
        const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
        const { updateUI } = await import('/src/ui.js');
        const map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({
          walls: [true, true, true, true],
          blockEnter: [false, false, false, false],
          type: 'empty',
        })));
        state.party = [createStartingKitCharacter('vanguard')];
        state.currentRun = createDefaultCurrentRun();
        state.floor = 1;
        state.x = 3;
        state.y = 3;
        state.dir = 0;
        state.maps[0] = map;
        state.visitedMaps[0] = map.map((row) => row.map(() => true));
        state.mapRevision = (state.mapRevision || 0) + 1;
        state.gameState = 'combat';
        state.transitioning = false;
        state.combatState = { phase: 'choose_actions', monsters };
        state.chestState = null;
        state.roamingMonsters = [];
        updateUI();
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.draw();
      }, fixture.monsters);

      const evidence = await page.evaluate(async () => {
        const { dungeonRenderer } = await import('/src/renderer.js');
        dungeonRenderer.camera.updateMatrixWorld();
        const project = (x, y, z) => {
          const point = dungeonRenderer.camera.position.clone().set(x, y, z).project(dungeonRenderer.camera);
          return { x: (point.x + 1) * 200, y: (1 - point.y) * 130 };
        };
        const bounds = (points) => ({
          left: Math.min(...points.map(({ x }) => x)),
          right: Math.max(...points.map(({ x }) => x)),
          top: Math.min(...points.map(({ y }) => y)),
          bottom: Math.max(...points.map(({ y }) => y)),
        });
        const combatGroups = [];
        const targetMeshes = [];
        dungeonRenderer.root.traverse((child) => {
          if (child.userData?.sceneLayer === 'combat') combatGroups.push(child);
          if (child.userData?.sceneLayer === 'combat-target') targetMeshes.push(child);
        });
        const groupEvidence = combatGroups.map((group) => {
          const body = group.children.find((child) => child.userData?.surface === 'combat-body');
          const label = group.children.find((child) => child.userData?.surface === 'combat-label');
          const marker = group.children.find((child) => child.userData?.surface === 'combat-marker');
          const radius = body.geometry.parameters.radius;
          const bodyBounds = bounds([-1, 1].flatMap((xSign) => [-1, 1].flatMap((ySign) => [-1, 1].map((zSign) => (
            project(
              group.position.x + xSign * radius,
              group.position.y + body.position.y + ySign * radius,
              group.position.z + zSign * radius,
            )
          )))));
          const labelWidth = label.geometry.parameters.width / 2;
          const labelHeight = label.geometry.parameters.height / 2;
          const labelBounds = bounds([-1, 1].flatMap((xSign) => [-1, 1].map((ySign) => (
            project(
              group.position.x + xSign * labelWidth,
              group.position.y + label.position.y + ySign * labelHeight,
              group.position.z,
            )
          ))));
          return {
            index: group.userData.monsterIndex,
            x: group.position.x,
            z: group.position.z,
            spacing: group.userData.staging.spacing,
            bodyRadius: radius,
            labelWidth: label.geometry.parameters.width,
            markerDiameter: (marker.geometry.parameters.radius + marker.geometry.parameters.tube) * 2,
            bodyBounds,
            labelBounds,
            marker: (() => {
              const marker = group.children.find((child) => child.userData?.surface === 'combat-marker');
              return marker ? [group.position.x + marker.position.x, marker.position.y, group.position.z + marker.position.z] : null;
            })(),
          };
        });
        return {
          groupEvidence,
          targetMeshes: targetMeshes.map((mesh) => ({
            targetIdx: mesh.userData.targetIdx,
            radius: mesh.geometry.parameters.radius,
            position: mesh.position.toArray(),
          })),
          frontWallZ: 0.1,
        };
      });

      expect(evidence.groupEvidence).toHaveLength(fixture.monsters.length);
      for (const group of evidence.groupEvidence) {
        expect(group.z).toBeGreaterThan(evidence.frontWallZ);
        expect(group.bodyRadius).toBeLessThan(0.32);
        for (const bound of [group.bodyBounds, group.labelBounds]) {
          expect(bound.left).toBeGreaterThanOrEqual(0);
          expect(bound.right).toBeLessThanOrEqual(400);
          expect(bound.top).toBeGreaterThanOrEqual(0);
          expect(bound.bottom).toBeLessThanOrEqual(260);
        }
        expect(group.marker[0]).toBeCloseTo(group.x, 5);
        expect(group.marker[2]).toBeCloseTo(group.z, 5);
      }
      if (fixture.name === 'multi') {
        expect(Math.abs(evidence.groupEvidence[1].x - evidence.groupEvidence[0].x)).toBeGreaterThan(0.8);
      }
      if (fixture.name !== 'single') {
        const labelsByScreenRow = [...evidence.groupEvidence].sort((a, b) => a.labelBounds.top - b.labelBounds.top);
        for (let index = 1; index < labelsByScreenRow.length; index += 1) {
          expect(labelsByScreenRow[index - 1].labelBounds.bottom).toBeLessThan(labelsByScreenRow[index].labelBounds.top);
        }
      }
      if (fixture.name === 'trio') {
        for (let index = 1; index < evidence.groupEvidence.length; index += 1) {
          const previous = evidence.groupEvidence[index - 1];
          const current = evidence.groupEvidence[index];
          expect(current.x - previous.x).toBeGreaterThan(previous.bodyRadius + current.bodyRadius);
        }
        for (const group of evidence.groupEvidence) {
          expect(group.markerDiameter).toBeLessThan(group.spacing);
        }
      }

      const screenshot = await page.locator('#dungeon-canvas').screenshot({
        path: testInfo.outputPath(`three-combat-${fixture.name}-${viewport.width}px.png`),
      });
      await testInfo.attach(`three-combat-${fixture.name}-${viewport.width}px`, {
        body: screenshot,
        contentType: 'image/png',
      });
    }
  }
});

test('Three.js target selection keeps enlarged hit regions aligned with staged enemies @smoke @visual @e2e', async ({ page }, testInfo) => {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/?renderer=three');
    await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');
    await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      const { openCombatTargetMenu } = await import('/src/combat_ui/target_menu.js');
      const map = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => ({
        walls: [true, true, true, true],
        blockEnter: [false, false, false, false],
        type: 'empty',
      })));
      state.party = [createStartingKitCharacter('vanguard')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 1;
      state.x = 3;
      state.y = 3;
      state.dir = 0;
      state.maps[0] = map;
      state.visitedMaps[0] = map.map((row) => row.map(() => true));
      state.mapRevision = (state.mapRevision || 0) + 1;
      state.gameState = 'combat';
      state.transitioning = false;
      state.combatState = {
        phase: 'choose_actions',
        monsters: [
          { name: '左の対象', level: 4, hp: 24, maxHp: 24, color: '#54c8c3', spriteType: 'golem' },
          { name: '中央の対象', level: 3, hp: 20, maxHp: 20, color: '#f0a04b', spriteType: 'wisp' },
          { name: '右の対象', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
        ],
      };
      menuContext.actorIdx = 0;
      openCombatTargetMenu('enemy', () => {});
      updateUI();
      const { dungeonRenderer } = await import('/src/renderer.js');
      dungeonRenderer.draw();
    });

    const evidence = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      const groups = [];
      const targets = [];
      const rings = [];
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.sceneLayer === 'combat') groups.push(child);
        if (child.userData?.targetIdx !== undefined && child.geometry?.parameters?.radius !== undefined) targets.push(child);
        if (child.userData?.surface === 'combat-target-ring') rings.push(child);
      });
      return {
        groups: groups.map((group) => group.position.toArray()),
        spacing: groups[0]?.userData.staging.spacing ?? null,
        targets: targets.map((target) => ({ idx: target.userData.targetIdx, radius: target.geometry.parameters.radius, position: target.position.toArray() })),
        rings: rings.map((ring) => ({ idx: ring.userData.targetIdx, outerRadius: ring.geometry.parameters.outerRadius, position: ring.position.toArray() })),
      };
    });

    expect(evidence.groups).toHaveLength(3);
    expect(evidence.targets).toHaveLength(3);
    expect(evidence.rings).toHaveLength(3);
    expect(evidence.targets.every(({ radius }) => radius > 0.5)).toBe(true);
    for (const target of evidence.targets) {
      const group = evidence.groups[target.idx];
      expect(target.position[0]).toBeCloseTo(group[0], 5);
      expect(target.position[2]).toBeCloseTo(group[2], 5);
    }
    for (const ring of evidence.rings) {
      expect(ring.position[0]).toBeCloseTo(evidence.groups[ring.idx][0], 5);
      expect(ring.position[2]).toBeCloseTo(evidence.groups[ring.idx][2], 5);
      expect(ring.outerRadius * 2).toBeLessThan(evidence.spacing);
    }

    const targetByBodyCenter = await page.evaluate(async () => {
      const { dungeonRenderer } = await import('/src/renderer.js');
      const canvas = document.querySelector('#dungeon-canvas');
      const rect = canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / 400, rect.height / 260);
      const renderedWidth = 400 * scale;
      const renderedHeight = 260 * scale;
      dungeonRenderer.camera.updateMatrixWorld();
      const groups = [];
      dungeonRenderer.root.traverse((child) => {
        if (child.userData?.sceneLayer === 'combat') groups.push(child);
      });
      return groups.map((group) => {
        const body = group.children.find((child) => child.userData?.surface === 'combat-body');
        const center = group.position.clone().add(body.position).project(dungeonRenderer.camera);
        const clientX = rect.left + (rect.width - renderedWidth) / 2 + ((center.x + 1) / 2) * renderedWidth;
        const clientY = rect.top + (rect.height - renderedHeight) / 2 + ((1 - center.y) / 2) * renderedHeight;
        return {
          expected: group.userData.monsterIndex,
          actual: dungeonRenderer.getCombatTargetAtClientPoint(clientX, clientY),
        };
      });
    });
    expect(targetByBodyCenter).toEqual([
      { expected: 0, actual: 0 },
      { expected: 1, actual: 1 },
      { expected: 2, actual: 2 },
    ]);

    const screenshot = await page.locator('#dungeon-canvas').screenshot({
      path: testInfo.outputPath(`three-combat-target-selection-${viewport.width}px.png`),
    });
    await testInfo.attach(`three-combat-target-selection-${viewport.width}px`, {
      body: screenshot,
      contentType: 'image/png',
    });
  }
});

test('Three.js Dungeon View disposes prototype materials across repeated scene rebuilds @e2e', async ({ page }) => {
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  const disposeCount = await page.evaluate(async () => {
    const { MeshStandardMaterial, ThreeDungeonRenderer } = await import('/src/three_renderer.js');
    const { dungeonRenderer } = await import('/src/renderer.js');
    const canvas = document.createElement('canvas');
    canvas.id = 'material-lifecycle-probe';
    document.body.append(canvas);
    const renderer = new ThreeDungeonRenderer(canvas.id);
    const baseInput = dungeonRenderer.getRenderInput();
    const townInput = {
      ...baseInput,
      sceneVisibility: {
        showTownBackground: true,
        showCombat: false,
        showChest: false,
        showEventScene: false,
        showItemMenu: false,
      },
    };
    const originalDispose = MeshStandardMaterial.prototype.dispose;
    let disposeCalls = 0;
    MeshStandardMaterial.prototype.dispose = function disposeSpy() {
      disposeCalls += 1;
      return originalDispose.call(this);
    };
    try {
      renderer.buildScene(townInput);
      renderer.buildScene(townInput);
    } finally {
      MeshStandardMaterial.prototype.dispose = originalDispose;
    }
    return disposeCalls;
  });

  // Each town build creates two prototype StandardMaterials without adding
  // them to the scene, so both builds must dispose four prototypes explicitly.
  expect(disposeCount).toBe(4);
});

test('Three.js Dungeon View follows map topology for all four directions @e2e @visual', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?renderer=three');
  await expect(page.locator('#dungeon-canvas')).toHaveAttribute('data-renderer', 'three');

  const topologyResult = await page.evaluate(async () => {
    const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const { getVisibleCorridorTopology } = await import('/src/rules/renderer_topology.js');
    const { DungeonRenderer, dungeonRenderer } = await import('/src/renderer.js');
    const probeCanvas = document.createElement('canvas');
    probeCanvas.id = 'canvas-topology-probe';
    document.body.append(probeCanvas);
    const canvasRenderer = new DungeonRenderer(probeCanvas.id);
    const drawCanvasProbe = (input) => {
      canvasRenderer.ctx.clearRect(0, 0, probeCanvas.width, probeCanvas.height);
      canvasRenderer.draw3DCorridors(canvasRenderer.ctx, input);
      return Array.from(canvasRenderer.ctx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data)
        .reduce((sum, value) => sum + value, 0);
    };
    const makeCell = () => ({
      walls: [true, true, true, true],
      blockEnter: [false, false, false, false],
      type: 'empty',
    });
    const map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
    const carve = (x, y, dir) => {
      const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      const [dx, dy] = offsets[dir];
      map[y][x].walls[dir] = false;
      map[y + dy][x + dx].walls[(dir + 2) % 4] = false;
    };
    carve(4, 4, 0);
    carve(4, 4, 1);
    carve(4, 4, 2);
    carve(4, 3, 1);

    state.party = [createStartingKitCharacter('vanguard')];
    state.currentRun = createDefaultCurrentRun();
    state.floor = 1;
    state.x = 4;
    state.y = 4;
    state.maps[state.floor - 1] = map;
    state.visitedMaps[state.floor - 1] = map.map(row => row.map(() => true));
    state.mapRevision = (state.mapRevision || 0) + 1;
    state.dir = 0;
    state.gameState = 'explore';
    state.transitioning = false;
    state.combatState = null;
    updateUI();

    const observations = [0, 1, 2, 3].map((dir) => {
      state.dir = dir;
      state.mapRevision += 1;
      updateUI();
      dungeonRenderer.draw();
      const canvasChecksum = drawCanvasProbe(dungeonRenderer.getRenderInput());
      const canvasTopology = getVisibleCorridorTopology(map, 4, 4, dir);
      const threeTopology = dungeonRenderer.getSceneTopology();
      const surfaces = [];
      dungeonRenderer.root.traverse((child) => {
        const topology = child.userData?.topology;
        if (topology?.x === 4 && topology?.y === 4 && child.userData.surface) {
          surfaces.push({
            surface: child.userData.surface,
            position: [child.position.x, child.position.y, child.position.z].map(value => Number(value.toFixed(3))),
            rotationY: Number(child.rotation.y.toFixed(3)),
          });
        }
      });
      return {
        dir,
        current: threeTopology.find(({ z, column }) => z === 0 && column === 0),
        canvasFacts: canvasTopology.map(({ z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier }) => ({
          z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier,
        })),
        threeFacts: threeTopology.map(({ z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier }) => ({
          z, column, x, y, leftBlocked, rightBlocked, frontBlocked, frontOneWayBarrier,
        })),
        surfaces,
        profile: dungeonRenderer.activeProfile,
        canvasChecksum,
        signature: dungeonRenderer.sceneSignature,
      };
    });

    state.x = 5;
    state.y = 4;
    state.dir = 0;
    state.mapRevision += 1;
    updateUI();
    dungeonRenderer.draw();
    const movedCanvasChecksum = drawCanvasProbe(dungeonRenderer.getRenderInput());
    const movedTopology = dungeonRenderer.getSceneTopology();

    state.x = 4;
    state.y = 4;
    map[3][4].blockEnter[2] = true;
    map[3][4].event = 'midboss';
    state.dir = 0;
    state.mapRevision += 1;
    updateUI();
    dungeonRenderer.draw();
    const oneWaySurfaces = [];
    const oneWayVisuals = [];
    let dangerCuePosition = null;
    dungeonRenderer.root.traverse((child) => {
      const topology = child.userData?.topology;
      if (topology?.x === 4 && topology?.y === 4 && child.userData.surface) {
        oneWaySurfaces.push(child.userData.surface);
        if (child.userData.surface === 'front-wall-one-way') {
          oneWayVisuals.push({ transparent: child.material.transparent, opacity: child.material.opacity });
        }
      }
      if (child.userData?.surface === 'danger-cue') dangerCuePosition = child.position.z;
    });
    return {
      observations,
      oneWaySurfaces,
      oneWayVisuals,
      dangerCuePosition,
      movement: {
        signature: dungeonRenderer.sceneSignature,
        current: movedTopology.find(({ z, column }) => z === 0 && column === 0),
        canvasChecksum: movedCanvasChecksum,
      },
    };
  });

  const { observations, oneWaySurfaces, oneWayVisuals, dangerCuePosition, movement } = topologyResult;
  const profile = observations[0].profile;
  expect(new Set(observations.map(({ signature }) => signature)).size).toBe(4);
  expect(observations.map(({ threeFacts }) => threeFacts)).toEqual(
    observations.map(({ canvasFacts }) => canvasFacts)
  );
  expect(observations.map(({ current }) => [current.leftBlocked, current.rightBlocked, current.frontBlocked])).toEqual([
    [true, false, false],
    [false, false, false],
    [false, true, false],
    [false, false, true],
  ]);
  expect(observations[3].threeFacts.some(({ z, column }) => z === 1 && column === 0)).toBe(false);
  expect(observations[0].surfaces.map(({ surface }) => surface)).toEqual(['floor', 'ceiling', 'left-wall']);
  expect(observations[2].surfaces.map(({ surface }) => surface)).toEqual(['floor', 'ceiling', 'right-wall']);
  expect(observations[3].surfaces.map(({ surface }) => surface)).toEqual(['floor', 'ceiling', 'front-wall']);
  const leftWall = observations[0].surfaces.find(({ surface }) => surface === 'left-wall');
  const rightWall = observations[2].surfaces.find(({ surface }) => surface === 'right-wall');
  const frontWall = observations[3].surfaces.find(({ surface }) => surface === 'front-wall');
  expect(leftWall).toEqual(expect.objectContaining({ rotationY: 1.571 }));
  expect(leftWall.position[0]).toBeCloseTo(-profile.cellWidth / 2, 3);
  expect(leftWall.position[1]).toBeCloseTo(profile.wallHeight / 2, 3);
  expect(rightWall).toEqual(expect.objectContaining({ rotationY: -1.571 }));
  expect(rightWall.position[0]).toBeCloseTo(profile.cellWidth / 2, 3);
  expect(rightWall.position[1]).toBeCloseTo(profile.wallHeight / 2, 3);
  expect(frontWall).toEqual(expect.objectContaining({ rotationY: 0 }));
  expect(frontWall.position[2]).toBeCloseTo(profile.frontWallZ, 3);
  expect(frontWall.position[1]).toBeCloseTo(profile.wallHeight / 2, 3);
  expect(oneWaySurfaces).toContain('front-wall-one-way');
  expect(oneWaySurfaces).toContain('front-wall-one-way-chevron');
  expect(oneWayVisuals).toEqual([{ transparent: true, opacity: 0.42 }]);
  expect(dangerCuePosition).toBeGreaterThan(0.1);
  expect(movement.current).toMatchObject({ x: 5, y: 4 });
  expect(movement.signature).not.toBe(observations[0].signature);
  expect(movement.canvasChecksum).not.toBe(observations[0].canvasChecksum);
});

test('Canvas and Three.js render the same representative dungeon states for comparison @visual', async ({ page }, testInfo) => {
  const modes = ['canvas', 'three'];
  const measurements = {};

  for (const mode of modes) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(mode === 'three' ? '/?renderer=three' : '/');
    if (mode === 'three') await expect(page.locator('#viewport-panel')).toHaveAttribute('data-renderer', 'three');

    const firstDrawReadyMs = await page.evaluate(async () => {
      const { state, createDefaultCurrentRun, createStartingKitCharacter } = await import('/src/state.js');
      const { updateUI } = await import('/src/ui.js');
      const makeCell = () => ({ walls: [false, false, false, false], blockEnter: [false, false, false, false], type: 'empty' });
      state.party = [createStartingKitCharacter('arcana')];
      state.currentRun = createDefaultCurrentRun();
      state.floor = 4;
      state.x = 4;
      state.y = 4;
      state.dir = 0;
      state.gameState = 'explore';
      state.transitioning = false;
      state.map = Array.from({ length: 9 }, () => Array.from({ length: 9 }, makeCell));
      state.map[4][5].walls[0] = true;
      state.map[3][4].event = 'midboss';
      state.roamingMonsters = [{ floor: 4, x: 4, y: 2, kind: 'elite', perception: 'visible' }];
      updateUI();
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      renderer.draw();
      const navigation = performance.getEntriesByType('navigation')[0];
      return Number((performance.now() - (navigation?.startTime || 0)).toFixed(1));
    });
    await page.screenshot({ path: testInfo.outputPath(`${mode}-explore-danger.png`) });

    await page.evaluate(async () => {
      const { state } = await import('/src/state.js');
      const { menuContext } = await import('/src/navigation.js');
      const { updateUI } = await import('/src/ui.js');
      state.gameState = 'combat';
      state.roamingMonsters = [];
      state.combatState = {
        phase: 'choose_actions',
        monsters: [
          { name: '禁書の番人', level: 5, hp: 30, maxHp: 30, color: '#54c8c3', spriteType: 'golem' },
          { name: '影の護衛', level: 2, hp: 16, maxHp: 16, color: '#d45de6', spriteType: 'wisp' },
        ],
      };
      menuContext.type = '';
      menuContext.prevGameState = null;
      updateUI();
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      renderer.draw();
    });
    await page.screenshot({ path: testInfo.outputPath(`${mode}-combat-multiple.png`) });

    measurements[mode] = await page.evaluate(async (firstDrawReadyMs) => {
      const renderer = (await import('/src/renderer.js')).dungeonRenderer;
      const renderInput = renderer.getRenderInput();
      const drawCallTimes = [];
      for (let index = 0; index < 31; index += 1) {
        const start = performance.now();
        renderer.draw(renderInput);
        if (index > 0) drawCallTimes.push(performance.now() - start);
      }
      const frameIntervals = await new Promise((resolve) => {
        const samples = [];
        let previous = performance.now();
        const sample = (now) => {
          const drawStart = performance.now();
          renderer.draw(renderInput);
          samples.push({ intervalMs: now - previous, drawMs: performance.now() - drawStart });
          previous = now;
          if (samples.length >= 31) resolve(samples);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const sorted = [...drawCallTimes].sort((left, right) => left - right);
      const sortedFrames = frameIntervals.map(({ intervalMs }) => intervalMs).sort((left, right) => left - right);
      const drawFrames = frameIntervals.map(({ drawMs }) => drawMs);
      return {
        firstDrawReadyMs,
        drawCallMedianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
        drawCallMaxMs: Number(Math.max(...drawCallTimes).toFixed(3)),
        sustainedDrawMedianMs: Number([...drawFrames].sort((left, right) => left - right)[Math.floor(drawFrames.length / 2)].toFixed(3)),
        sustainedDrawMaxMs: Number(Math.max(...drawFrames).toFixed(3)),
        frameMedianMs: Number(sortedFrames[Math.floor(sortedFrames.length / 2)].toFixed(3)),
        frameMaxMs: Number(Math.max(...frameIntervals.map(({ intervalMs }) => intervalMs)).toFixed(3)),
        longFrameCount: frameIntervals.filter(({ intervalMs }) => intervalMs > 50).length,
        jsHeapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
        canvasSize: [document.querySelector('#dungeon-canvas').width, document.querySelector('#dungeon-canvas').height],
      };
    }, firstDrawReadyMs);
  }

  console.log(`[issue-1146] renderer comparison ${JSON.stringify(measurements)}`);
  expect(measurements.canvas.canvasSize).toEqual([400, 260]);
  expect(measurements.three.canvasSize).toEqual([400, 260]);
});
