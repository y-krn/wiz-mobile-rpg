import { test, expect } from './fixtures/browser-health.js';

const VIEWPORTS = [
  { width: 320, height: 568, name: '320x568' },
  { width: 360, height: 800, name: '360x800' },
  { width: 390, height: 844, name: '390x844' },
  { width: 430, height: 932, name: '430x932' },
];

async function seedState(page, mode) {
  await page.evaluate(async (nextMode) => {
    const { state, createDefaultCurrentRun, createSoloCharacter } = await import('/src/state.js');
    const { menuContext, openSubmenu } = await import('/src/navigation.js');
    const { updateUI } = await import('/src/ui.js');

    state.party = [createSoloCharacter(nextMode === 'spell' ? 'Mage' : 'Fighter')];
    state.currentRun = createDefaultCurrentRun();
    state.inventory = Array.from({ length: nextMode === 'inventory' ? 20 : 3 }, () => 'HEAL_POTION');
    state.gameState = 'explore';
    state.transitioning = false;
    state.activeTrapState = null;
    state.combatState = null;
    menuContext.type = '';
    menuContext.prevGameState = null;

    if (nextMode === 'town') {
      state.gameState = 'town';
      state.currentRun = null;
      updateUI();
    } else if (nextMode === 'explore') {
      updateUI();
    } else if (nextMode === 'combat') {
      state.gameState = 'combat';
      state.combatState = {
        phase: 'choose_actions',
        monsters: [{ name: '検証敵', hp: 10, maxHp: 10, atk: 1, def: 1 }],
        isAuto: false,
      };
      updateUI();
    } else if (nextMode === 'trap') {
      state.gameState = 'trap_encounter';
      state.activeTrapState = {
        trap: { type: 'poison needle', state: 'discovered', floorId: 'B1' },
        successRate: 50,
        expectedEffect: 'ダメージ',
        revealLevel: 3,
      };
      updateUI();
    } else if (nextMode === 'result') {
      state.gameState = 'result';
      state.currentRun.returnReason = 'stairs';
      state.currentRun.deepestFloor = 1;
      updateUI();
    } else if (nextMode === 'inventory') {
      openSubmenu('item_inventory', 'バッグ');
    } else if (nextMode === 'spell') {
      openSubmenu('spell_caster_select', '魔法');
    } else if (nextMode === 'equip') {
      state.gameState = 'equip_overlay';
      updateUI();
    }
  }, mode);
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() || null;
    const visible = element => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0;
    };
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter(visible)
      .map(element => ({
        id: element.id,
        text: element.textContent.trim().replace(/\s+/g, ' '),
        rect: element.getBoundingClientRect().toJSON(),
        disabled: element.disabled === true,
      }));
    const overflow = Array.from(document.querySelectorAll('body *'))
      .filter(visible)
      .filter(element => {
        const box = element.getBoundingClientRect();
        return box.left < -1 || box.right > window.innerWidth + 1;
      })
      .slice(0, 5)
      .map(element => ({ id: element.id, className: element.className, rect: element.getBoundingClientRect().toJSON() }));
    const activeOverlay = ['equip-overlay', 'spell-overlay', 'combat-overlay', 'archives-overlay', 'result-overlay']
      .map(id => document.getElementById(id))
      .find(element => element && visible(element));
    const scrollRegions = ['.town-grid', '#submenu-options', '.spell-item-list', '.equip-item-list', '.equip-equipped-section']
      .map(selector => document.querySelector(selector))
      .filter(element => element && visible(element))
      .map(element => ({
        selector: element.id ? `#${element.id}` : `.${element.className.split(/\s+/)[0]}`,
        rect: element.getBoundingClientRect().toJSON(),
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      }));
    return {
      mode: document.querySelector('#game-container')?.className,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      header: rect('#game-header'),
      goal: rect('#goal-banner'),
      viewportPanel: rect('#viewport-panel'),
      log: rect('#log-panel'),
      controls: rect('#controls-panel'),
      party: rect('#character-panel'),
      overlay: activeOverlay?.getBoundingClientRect().toJSON() || null,
      buttons,
      overflow,
      scrollRegions,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`Issue #1031 shell invariants hold at ${viewport.name} with safe area @smoke`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });

    for (const mode of ['town', 'explore', 'combat', 'trap', 'result', 'inventory', 'spell', 'equip']) {
      await seedState(page, mode);
      const layout = await readLayout(page);

      expect(layout.scrollWidth, `${mode} horizontal overflow`).toBeLessThanOrEqual(viewport.width + 1);
      expect(layout.overflow, `${mode} visible overflow`).toEqual([]);
      expect(layout.viewportMeta, `${mode} keeps browser zoom available`).not.toMatch(/(?:maximum-scale|user-scalable\s*=\s*no)/i);
      for (const button of layout.buttons) {
        expect(button.rect.height, `${mode} ${button.id || button.text} tap height`).toBeGreaterThanOrEqual(44);
      }
      expect(layout.header.top, `${mode} header clears safe area`).toBeGreaterThanOrEqual(59);
      if (!layout.overlay) {
        expect(layout.party.bottom, `${mode} party clears home indicator`).toBeLessThanOrEqual(viewport.height - 34 + 1);
      }
      if (layout.controls && !layout.overlay) {
        expect(layout.controls.bottom, `${mode} controls stay above party HUD`).toBeLessThanOrEqual(layout.party.top + 1);
      }

      for (const region of layout.scrollRegions) {
        expect(region.rect.left, `${mode} ${region.selector} scroll region left edge`).toBeGreaterThanOrEqual(-1);
        expect(region.rect.right, `${mode} ${region.selector} scroll region right edge`).toBeLessThanOrEqual(viewport.width + 1);
      }

      if (mode === 'town' || mode === 'inventory') {
        const selector = mode === 'town' ? '.town-grid' : '#submenu-options';
        const region = page.locator(selector);
        await region.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        const lastButton = region.locator('button').last();
        const lastButtonBox = await lastButton.boundingBox();
        const regionBox = await region.boundingBox();
        expect(lastButtonBox, `${mode} last list action exists`).not.toBeNull();
        expect(regionBox, `${mode} scroll region exists`).not.toBeNull();
        expect(lastButtonBox.y + lastButtonBox.height, `${mode} last list action reachable`)
          .toBeLessThanOrEqual(regionBox.y + regionBox.height + 1);
      }
    }
  });
}

test('Issue #1031 primary run path reaches Town again through UI actions @e2e @smoke', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.addStyleTag({ content: ':root { --safe-area-top: 59px; --safe-area-bottom: 34px; }' });

  const screen = async () => page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { menuContext } = await import('/src/navigation.js');
    return {
      gameState: state.gameState,
      menu: menuContext.type,
      returnReason: state.currentRun?.returnReason || null,
      visibleDocks: Array.from(document.querySelectorAll('#controls-panel .controls-group'))
        .filter(element => getComputedStyle(element).display !== 'none')
        .map(element => element.id),
      combatOverlay: getComputedStyle(document.querySelector('#combat-overlay')).display !== 'none',
    };
  });

  const expectSingleDock = async (dockId) => {
    await expect(page.locator(`#${dockId}`)).toBeVisible({ timeout: 10_000 });
    const state = await screen();
    expect(state.visibleDocks, `only ${dockId} should be visible`).toEqual([dockId]);
    expect(state.combatOverlay, `${dockId} should not leave the combat overlay behind`).toBe(false);
  };

  await expectSingleDock('town-controls');

  // Town -> Preparation -> Explore are crossed using the real departure controls.
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await page.locator('.solo-class-option').first().click();
  await page.getByRole('button', { name: /B1Fから開始/ }).click();
  await expectSingleDock('explore-controls');
  expect(await screen()).toMatchObject({ gameState: 'explore' });

  // Make the next visible forward action produce a deterministic encounter.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const directions = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    ];
    const direction = directions.findIndex(({ dx, dy }, index) => {
      const cell = state.map?.[state.y]?.[state.x];
      const next = state.map?.[state.y + dy]?.[state.x + dx];
      return cell && next && next.type === 'empty' && !next.event && !next.trap &&
        !cell.walls[index] && !next.blockEnter[(index + 2) % 4];
    });
    if (direction < 0) throw new Error('No passable encounter direction at the run entry cell');
    state.dir = direction;
    // handleMove ticks exploration effects before checking the event, so two
    // steps leave one forced encounter after that tick.
    state.forcedEncounterSteps = 2;
    updateUI();
  });
  await page.locator('#btn-move-forward').click();
  await expect(page.locator('#combat-controls')).toBeVisible({ timeout: 10_000 });
  expect(await screen()).toMatchObject({ gameState: 'combat', menu: '' });

  // Keep the combat interaction real while making its result deterministic:
  // the escape action ends combat without depending on enemy traits or rolls.
  await page.locator('#btn-combat-run').click();
  await expect(page.locator('#explore-controls')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#combat-overlay')).toBeHidden();
  await expectSingleDock('explore-controls');
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    state.inventory.push('HEAL_POTION');
    updateUI();
  });

  // Explore -> Bag is also crossed through its visible action.
  await page.locator('#btn-inspect').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await expect(page.locator('#submenu-options')).toContainText('傷薬');
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'item_inventory' });
  await page.locator('#btn-submenu-back').click();
  await expectSingleDock('explore-controls');

  // Prepare a reachable B5F portal target; the portal and every subsequent gate
  // are still opened and confirmed through the rendered UI.
  await page.evaluate(async () => {
    const { state } = await import('/src/state.js');
    const { updateUI } = await import('/src/ui.js');
    const map = structuredClone(state.maps[0]);
    const directions = [
      { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 },
    ];
    let source = null;
    for (let y = 1; y < map.length - 1 && !source; y++) {
      for (let x = 1; x < map[y].length - 1 && !source; x++) {
        for (let dir = 0; dir < directions.length; dir++) {
          const { dx, dy } = directions[dir];
          const cell = map[y][x];
          const target = map[y + dy]?.[x + dx];
          if (cell.type === 'empty' && target?.type === 'empty' &&
              !cell.walls[dir] && !target.blockEnter[(dir + 2) % 4]) {
            source = { x, y, dir, targetX: x + dx, targetY: y + dy };
            break;
          }
        }
      }
    }
    if (!source) throw new Error('No passable portal direction in the generated map');
    map[source.targetY][source.targetX] = {
      ...map[source.targetY][source.targetX],
      event: 'return_portal',
      milestoneFloor: 5,
      trap: null,
    };
    map[source.y][source.x] = { ...map[source.y][source.x], event: null, trap: null };
    state.maps[4] = map;
    state.visitedMaps[4] = map.map(row => row.map(() => false));
    state.floor = 5;
    state.x = source.x;
    state.y = source.y;
    state.dir = source.dir;
    state.currentRun.floorsVisited = [1, 5];
    state.currentRun.deepestFloor = 5;
    state.currentRun.defeatedMilestones = [5];
    state.currentRun.unbankedObjectLoot ||= [];
    updateUI();
  });
  await page.locator('#btn-move-forward').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  await expect(page.locator('.milestone-portal-choice-card[data-portal-decision="return"] button')).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'milestone_portal' });
  expect((await screen()).visibleDocks).toEqual(['submenu-controls']);

  // Portal Return -> Result -> Town -> Preparation remains one UI-operated chain.
  await page.locator('.milestone-portal-choice-card[data-portal-decision="return"] > button').click();
  await expect(page.locator('.milestone-portal-confirmation')).toBeVisible();
  await page.locator('#btn-portal-confirm').click();
  await expect(page.locator('#result-overlay')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'result', returnReason: 'milestone_portal' });
  await page.locator('#btn-result-castle').click();
  await expectSingleDock('town-controls');
  expect(await screen()).toMatchObject({ gameState: 'town' });
  await page.locator('#btn-town-dungeon').click();
  await expect(page.locator('#submenu-controls')).toBeVisible();
  expect(await screen()).toMatchObject({ gameState: 'submenu', menu: 'solo_start' });
});
